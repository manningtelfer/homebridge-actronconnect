import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ActronAirPlatform } from './platform';
import { cloudGet, cloudPut } from './http';
import type { CloudApiResponse, SettingsDA, StateDA } from './types';

export class ActronAirAccessory {
  private service: Service;
  private fanService: Service;
  private zones: Record<string, Service> = {};

  constructor(
    private readonly platform: ActronAirPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ActronAir');

    this.service =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);

    this.fanService =
      this.accessory.getService(this.platform.Service.Fanv2) ||
      this.accessory.addService(this.platform.Service.Fanv2);

    this.fanService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${accessory.context.device.name} Fan Speed`,
    );
    this.fanService.setCharacteristic(
      this.platform.Characteristic.ConfiguredName,
      `${accessory.context.device.name} Fan Speed`,
    );

    this.fanService
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.handleFanSpeedGet.bind(this))
      .onSet(this.handleFanSpeedSet.bind(this));

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name,
    );

    this.service.setCharacteristic(
      this.platform.Characteristic.TemperatureDisplayUnits,
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS,
    );

    const zConfig: Record<string, string>[] = this.accessory.context.device.zones;
    if (zConfig && Array.isArray(zConfig) && zConfig.length > 0) {
      for (const z of zConfig) {
        this.zones[String(z.index)] =
          this.accessory.getService(z.name) ||
          this.accessory.addService(this.platform.Service.Switch, z.name, `zone-${z.index}`);
        this.zones[String(z.index)].setCharacteristic(this.platform.Characteristic.Name, z.name);
        this.zones[String(z.index)].setCharacteristic(this.platform.Characteristic.ConfiguredName, z.name);
        this.zones[String(z.index)]
          .getCharacteristic(this.platform.Characteristic.On)
          .onGet(this.handleZoneOnGet.bind(this, Number(z.index)))
          .onSet(this.handleZoneOnSet.bind(this, Number(z.index)));
      }
    }

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this));
  }

  private get devicesUrl(): string {
    return `https://que.actronair.com.au/rest/v0/devices?user_access_token=${this.accessory.context.device.user_token}`;
  }

  private get settingsUrl(): string {
    const { device_token, user_token } = this.accessory.context.device;
    return `https://que.actronair.com.au/rest/v0/device/${device_token}_0_2_4?user_access_token=${user_token}`;
  }

  private get zonesUrl(): string {
    const { device_token, user_token } = this.accessory.context.device;
    return `https://que.actronair.com.au/rest/v0/device/${device_token}_0_2_5?user_access_token=${user_token}`;
  }

  private getStateDA(b: CloudApiResponse): StateDA {
    const key = `${this.accessory.context.device.device_token}_0_2_6`;
    const da = b.data?.[key]?.last_data?.DA;
    if (!da) {
      throw new Error('No state data in cloud response');
    }
    return da as StateDA;
  }

  private getSettingsDA(b: CloudApiResponse): SettingsDA {
    const key = `${this.accessory.context.device.device_token}_0_2_4`;
    const da = b.data?.[key]?.last_data?.DA;
    if (!da) {
      throw new Error('No settings data in cloud response');
    }
    return da as SettingsDA;
  }

  async handleCurrentHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    try {
      const state = this.getStateDA(await cloudGet(this.devicesUrl));
      this.platform.log.debug('Aircon state ->', state);
      if (!state.isOn) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      }
      return state.mode === 1
        ? this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
        : this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    } catch (err) {
      this.platform.log.debug('Actron Error in GET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleTargetHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    try {
      const state = this.getStateDA(await cloudGet(this.devicesUrl));
      if (!state.isOn) {
        return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
      }
      if (state.mode === 0) {
        return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
      }
      if (state.mode === 1) {
        return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      }
      return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
    } catch (err) {
      this.platform.log.debug('Actron Error in GET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue): Promise<void> {
    try {
      const settings = this.getSettingsDA(await cloudGet(this.devicesUrl));
      if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
        settings.amOn = false;
      } else {
        settings.amOn = true;
        if (value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
          settings.mode = 1;
        } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.COOL) {
          settings.mode = 2;
        } else {
          settings.mode = 0;
        }
      }
      await cloudPut(this.settingsUrl, { DA: settings });
      this.platform.log.debug('Aircon target state set to ->', value);
    } catch (err) {
      this.platform.log.debug('Actron Error in SET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    try {
      const state = this.getStateDA(await cloudGet(this.devicesUrl));
      this.platform.log.debug('Aircon current temp ->', state.roomTemp_oC);
      return state.roomTemp_oC;
    } catch (err) {
      this.platform.log.debug('Actron Error in GET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleTargetTemperatureGet(): Promise<CharacteristicValue> {
    try {
      const state = this.getStateDA(await cloudGet(this.devicesUrl));
      const sp = state.setPoint;
      const value = typeof sp === 'object' ? sp.parsedValue : sp;
      this.platform.log.debug('Aircon setPoint ->', value);
      return value;
    } catch (err) {
      this.platform.log.debug('Actron Error in GET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleTargetTemperatureSet(value: CharacteristicValue): Promise<void> {
    try {
      const settings = this.getSettingsDA(await cloudGet(this.devicesUrl));
      settings.tempTarget = value as number;
      await cloudPut(this.settingsUrl, { DA: settings });
      this.platform.log.debug('Aircon tempTarget set to ->', value);
    } catch (err) {
      this.platform.log.debug('Actron Error in SET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleZoneOnGet(index: number): Promise<CharacteristicValue> {
    try {
      const state = this.getStateDA(await cloudGet(this.devicesUrl));
      return state.enabledZones[index];
    } catch (err) {
      this.platform.log.debug('Actron Error in GET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleZoneOnSet(index: number, value: CharacteristicValue): Promise<void> {
    try {
      const state = this.getStateDA(await cloudGet(this.devicesUrl));
      const zones = [...state.enabledZones];
      zones[index] = value as number;
      await cloudPut(this.zonesUrl, { DA: zones });
      this.platform.log.debug('Aircon zones SET ->', index, value);
    } catch (err) {
      this.platform.log.debug('Actron Error in SET->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleFanSpeedGet(): Promise<CharacteristicValue> {
    try {
      const state = this.getStateDA(await cloudGet(this.devicesUrl));
      this.platform.log.debug('Fan speed fetched ->', state.fanSpeed);
      return [0, 50, 100][state.fanSpeed] ?? 0;
    } catch (err) {
      this.platform.log.debug('Actron Error in GET Fan Speed->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async handleFanSpeedSet(value: CharacteristicValue): Promise<void> {
    try {
      const settings = this.getSettingsDA(await cloudGet(this.devicesUrl));
      const v = typeof value === 'number' ? value : 0;
      settings.fanSpeed = v <= 33 ? 0 : v <= 67 ? 1 : 2;
      await cloudPut(this.settingsUrl, { DA: settings });
      this.platform.log.debug('Fan speed set to ->', settings.fanSpeed);
    } catch (err) {
      this.platform.log.debug('Actron Error in SET Fan Speed->', err);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }
}
