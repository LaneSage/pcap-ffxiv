import { ActorControl } from "./ActorControl";

export interface DesynthOrReductionResult extends ActorControl {
	param2: number;
	param4: number;

	resultType: number;
	itemId: number;
	itemHQ: boolean;
	exp: number;
}
