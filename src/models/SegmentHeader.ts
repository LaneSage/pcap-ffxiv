import { SegmentType } from "./SegmentType";

export interface SegmentHeader {
	size: number;
	sourceActor: number;
	targetActor: number;
	segmentType: SegmentType;
	padding: number;
	operation: "send" | "receive";
}
