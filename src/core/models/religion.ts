import { ReligiousPolicy } from "./enums";

export interface ReligionState {
  stateFaith: string;
  policy: ReligiousPolicy;
  authority: number;
  cohesion: number;
  conversionPressure: number;
  tolerance: number;
}
