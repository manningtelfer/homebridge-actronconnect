export interface SettingsDA {
  amOn: boolean;
  tempTarget: number | { source: string; parsedValue: number };
  mode: number;
  fanSpeed: number;
  enabledZones: number[];
}

export interface StateDA {
  isOn: boolean;
  mode: number;
  fanSpeed: number;
  setPoint: number | { source: string; parsedValue: number };
  roomTemp_oC: number;
  enabledZones: number[];
}

export interface CloudApiResponse {
  result: number;
  error: string | null;
  data: Record<string, { last_data: { DA?: unknown } }> | null;
}

export interface SigninResponse {
  status: number;
  value: {
    userAccessToken: string;
    airconBlockId: string;
    airconZoneNumber: number;
    zones: string[];
  };
  message: string;
}
