import { BufferReader } from "../../BufferReader";
import { NpcSpawn } from "../../definitions";

export function npcSpawn(reader: BufferReader): NpcSpawn {
	return {
		gimmickId: reader.nextUInt32(),
		u2b: reader.nextUInt8(),
		u2ab: reader.nextUInt8(),
		gmRank: reader.nextUInt8(),
		u3b: reader.nextUInt8(),
		aggressionMode: reader.nextUInt8(),
		onlineStatus: reader.nextUInt8(),
		u3c: reader.nextUInt8(),
		pose: reader.nextUInt8(),
		u4: reader.nextUInt32(),
		targetId: reader.nextUInt64(),
		u6: reader.nextUInt32(),
		u7: reader.nextUInt32(),
		mainWeaponModel: reader.nextUInt64(),
		secWeaponModel: reader.nextUInt64(),
		craftToolModel: reader.nextUInt64(),
		u14: reader.nextUInt32(),
		u15: reader.nextUInt32(),
		bNpcBase: reader.nextUInt32(),
		bNpcName: reader.nextUInt32(),
		levelId: reader.nextUInt32(),
		u19: reader.nextUInt32(),
		directorId: reader.nextUInt32(),
		spawnerId: reader.nextUInt32(),
		parentActorId: reader.nextUInt32(),
		hPMax: reader.nextUInt32(),
		hPCurr: reader.nextUInt32(),
		displayFlags: reader.nextUInt32(),
		fateId: reader.nextUInt16(),
		mPCurr: reader.nextUInt16(),
		tPCurr: reader.nextUInt16(),
		mPMax: reader.nextUInt16(),
		tPMax: reader.nextUInt16(),
		modelChara: reader.nextUInt16(),
		rotation: reader.nextUInt16(),
		activeMinion: reader.nextUInt16(),
		spawnIndex: reader.nextUInt8(),
		state: reader.nextUInt8(),
		persistantEmote: reader.nextUInt8(),
		modelType: reader.nextUInt8(),
		subtype: reader.nextUInt8(),
		voice: reader.nextUInt8(),
		u25c: reader.nextUInt16(),
		enemyType: reader.nextUInt8(),
		level: reader.nextUInt8(),
		classJob: reader.nextUInt8(),
		u26d: reader.nextUInt8(),
		u27a: reader.nextUInt16(),
		currentMount: reader.nextUInt8(),
		mountHead: reader.nextUInt8(),
		mountBody: reader.nextUInt8(),
		mountFeet: reader.nextUInt8(),
		mountColor: reader.nextUInt8(),
		scale: reader.nextUInt8(),
		elementalLevel: reader.nextUInt16(),
		element: reader.nextUInt16(),
		u30b: reader.nextUInt32(),
		effects: Array(30)
			.fill(null)
			.map(() => {
				return {
					id: reader.nextUInt16(),
					sourceActorId: reader.nextUInt32(),
				};
			}),
		effect_id: reader.nextUInt16(),
		sourceActorId: reader.nextUInt32(),
		pos: reader.nextPosition3(),
		models: Array(1)
			.fill(null)
			.map(() => {
				return reader.nextUInt32();
			}),
		looks: Array(26)
			.fill(null)
			.map(() => {
				return reader.nextUInt8();
			}),
		name: reader.nextString(),
		fcTag: reader.nextString(),
		bNpcPartSlot: reader.nextUInt8(),
	};
}
