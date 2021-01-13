import { Cap, decoders } from "cap";
import { EventEmitter } from "events";
import { isMagical, parseFrameHeader, parseIpcHeader, parseSegmentHeader, tryGetFrameHeader } from "./frame-processing";
import {
	ConstantsList,
	DiagnosticInfo,
	FrameHeader,
	IpcHeader,
	OpcodeList,
	Packet,
	Region,
	Segment,
	SegmentType,
} from "./models";
import pako from "pako";
import { downloadJson } from "./json-downloader";
import { performance } from "perf_hooks";
import { loadPacketProcessors } from "./packet-processors/load-packet-processors";
import { BufferReader } from "./BufferReader";
import { QueueBuffer } from "./QueueBuffer";
import {
	BUFFER_SIZE,
	MEGABYTE,
	ETH_HEADER_SIZE,
	IPV4_HEADER_SIZE,
	TCP_HEADER_SIZE,
	FRAME_HEADER_SIZE,
	SEG_HEADER_SIZE,
	IPC_HEADER_SIZE,
} from "./constants";
import { roundToNextPowerOf2 } from "./memory";

const PROTOCOL = decoders.PROTOCOL;
const FILTER =
	"tcp portrange 54992-54994 or tcp portrange 55006-55007 or tcp portrange 55021-55040 or tcp portrange 55296-55551";

export class CaptureInterface extends EventEmitter {
	private readonly _cap: Cap;
	private readonly _buf: Buffer;

	// We use the destination port as the key.
	private readonly _bufTable: Record<number, QueueBuffer>;

	private _opcodeLists: OpcodeList[] | undefined;
	private _constants: Record<keyof Region, ConstantsList> | undefined;
	private _packetDefs: Record<string, (reader: BufferReader, constants: ConstantsList) => any>;
	private _region: Region;
	private _opcodes: Record<number, string> = {};

	public get constants(): ConstantsList | undefined {
		return this._constants ? this._constants[this._region] : undefined;
	}

	constructor(region: Region = "Global") {
		super();

		this._cap = new Cap();
		this._buf = Buffer.alloc(BUFFER_SIZE);
		this._bufTable = {};

		this._region = region;
		this._packetDefs = loadPacketProcessors();

		this._loadOpcodes().then(async () => {
			await this._loadConstants();
			this.emit("ready");
		});
	}

	setRegion(region: Region) {
		this._region = region;
		this.updateOpcodesCache();
	}

	updateOpcodesCache(): void {
		const regionOpcodes = this._opcodeLists?.find((ol) => ol.region === this._region);

		this._opcodes = regionOpcodes?.lists.ServerZoneIpcType.concat(regionOpcodes?.lists.ClientZoneIpcType).reduce(
			(acc, entry) => {
				return {
					...acc,
					[entry.opcode]: entry.name,
				};
			},
			{},
		) as Record<number, string>;
	}

	open(deviceIdentifier: string) {
		const device = Cap.findDevice(deviceIdentifier);
		this._cap.open(device, FILTER, 10 * MEGABYTE, this._buf);
		this._cap.setMinBytes &&
			this._cap.setMinBytes(ETH_HEADER_SIZE + IPV4_HEADER_SIZE + TCP_HEADER_SIZE + FRAME_HEADER_SIZE + SEG_HEADER_SIZE);
		this._registerInternalHandlers();
	}

	close() {
		this._cap.close();
	}

	private async _loadOpcodes() {
		this._opcodeLists = await downloadJson(
			"https://raw.githubusercontent.com/karashiiro/FFXIVOpcodes/master/opcodes.min.json",
		);
		this.updateOpcodesCache();
	}

	private async _loadConstants() {
		this._constants = await downloadJson(
			"https://raw.githubusercontent.com/karashiiro/FFXIVOpcodes/master/constants.min.json",
		);
	}

	private _getBuffer(port: number): QueueBuffer {
		return (this._bufTable[port] ||= QueueBuffer.fromBuffer(Buffer.alloc(BUFFER_SIZE)));
	}

	private _registerInternalHandlers() {
		this._cap.on("packet", (nBytes: number) => {
			// The total buffer is way bigger than the relevant data, so we trim that first.
			const payload = this._buf.slice(0, nBytes);

			let ret = decoders.Ethernet(payload);
			if (ret.info.type !== PROTOCOL.ETHERNET.IPV4) return;
			ret = decoders.IPV4(payload, ret.offset);

			// The info object is destroyed once we decode the TCP data from the packet payload.
			const srcAddr = ret.info.srcaddr;
			const dstAddr = ret.info.dstaddr;

			if (ret.info.protocol !== PROTOCOL.IP.TCP) return;
			let datalen = ret.info.totallen - ret.hdrlen;
			ret = decoders.TCP(payload, ret.offset);
			datalen -= ret.hdrlen;

			if ((ret.info.flags & 8) === 0) return; // Only TCP PSH has actual data.

			const childFramePayload = payload.slice(payload.length - datalen);
			const buf = this._getBuffer(ret.info.dstport);
			buf.push(childFramePayload);

			let frameHeader: FrameHeader;
			while ((frameHeader = tryGetFrameHeader(buf)) && isMagical(frameHeader) && buf.size() >= frameHeader.size) {
				this._processFrame(
					frameHeader,
					buf.pop(frameHeader.size),
					srcAddr,
					dstAddr,
					ret.info.srcport,
					ret.info.dstport,
				);
			}
		});
	}

	private _processFrame(
		frameHeader: FrameHeader,
		buf: Buffer,
		srcAddr: string,
		dstAddr: string,
		srcPort: number,
		dstPort: number,
	) {
		const start = performance.now();

		const packet: Packet = {
			source: {
				address: srcAddr,
				port: srcPort,
			},
			destination: {
				address: dstAddr,
				port: dstPort,
			},
			childFrame: {
				header: frameHeader,
				segments: [],
			},
		};

		// Decompress the segments, if necessary.
		let remainder = buf.slice(FRAME_HEADER_SIZE);
		if (frameHeader.isCompressed) {
			try {
				const decompressed = pako.inflate(remainder);
				remainder = Buffer.from(decompressed.buffer);
			} catch (err) {
				// This will happen if the packet contents are encrypted.
				if (err === "incorrect header check") {
					return;
				}
			}
		}

		let offset = 0;
		for (let i = 0; i < frameHeader.segmentCount; i++) {
			const segmentPayload = remainder.slice(offset);
			const segmentHeader = parseSegmentHeader(segmentPayload);

			let ipcHeader: IpcHeader | undefined;
			let ipcData: Buffer | undefined;
			if (segmentHeader.segmentType === SegmentType.Ipc) {
				const ipcPayload = remainder.slice(offset + SEG_HEADER_SIZE);
				ipcHeader = parseIpcHeader(ipcPayload);
				ipcData = Buffer.alloc(roundToNextPowerOf2(segmentHeader.size - SEG_HEADER_SIZE - IPC_HEADER_SIZE));
				ipcPayload.copy(ipcData, 0, IPC_HEADER_SIZE);
			}

			const segment: Segment<any> = {
				header: segmentHeader,
				ipcHeader,
				ipcData,
			};
			packet.childFrame.segments.push(segment);

			// If the segment is an IPC segment, get the known name of the contained message and fire an event.
			if (ipcHeader != null) {
				let typeName = this._opcodes[ipcHeader?.type] || "unknown";
				typeName = typeName[0].toLowerCase() + typeName.slice(1);

				// Unmarshal the data, if possible.
				if (this._packetDefs[typeName] && this._constants) {
					const reader = new BufferReader(ipcData!);
					segment.parsedIpcData = this._packetDefs[typeName](reader, this._constants[this._region]);
				}

				this.emit("message", typeName, segment);
			}

			this.emit("segment", segment);

			offset += segmentHeader.size;
		}

		this.emit("packet", packet);

		const end = performance.now();
		this.emit("diagnostics", {
			lastProcessingTimeMs: end - start,
		});
	}

	static getDevices(): {
		name: string;
		description?: string;
		addresses: { addr: string; netmask: string; broadaddr?: string }[];
		flags?: string;
	}[] {
		return Cap.deviceList();
	}
}

interface CaptureInterfaceEvents {
	ready: () => void;
	error: (err: Error) => void;
	packet: (packet: Packet) => void;
	segment: (segment: Segment<any>) => void;
	message: (type: string, message: Segment<any>) => void;
	diagnostics: (diagInfo: DiagnosticInfo) => void;
}

export declare interface CaptureInterface {
	on<U extends keyof CaptureInterfaceEvents>(event: U, listener: CaptureInterfaceEvents[U]): this;

	emit<U extends keyof CaptureInterfaceEvents>(event: U, ...args: Parameters<CaptureInterfaceEvents[U]>): boolean;
}
