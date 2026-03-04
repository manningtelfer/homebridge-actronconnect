import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ActronAirAccessory } from './platformAccessory';
import { cloudSignin } from './http';
import type { SigninResponse } from './types';

export class ActronAirPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  private readonly accessories = new Map<string, PlatformAccessory>();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    const { email, password } = this.config;
    if (!email || !password) {
      this.log.error('Email and password are required in config');
      return;
    }

    let signin: SigninResponse;
    try {
      signin = await cloudSignin(email as string, password as string);
    } catch (err) {
      this.log.error('Failed to authenticate with ActronAir:', err);
      return;
    }

    const { userAccessToken, airconBlockId, airconZoneNumber, zones } = signin.value;
    const mac = airconBlockId.slice(-12).match(/.{2}/g)!.join(':').toUpperCase();
    const zoneConfig = zones.slice(0, airconZoneNumber).map((name, index) => ({ name, index }));

    const device = {
      name: (this.config.name as string) || 'Air Conditioning',
      mac,
      device_token: airconBlockId,
      user_token: userAccessToken,
      zones: zoneConfig,
    };

    const uuid = this.api.hap.uuid.generate(mac);
    const existingAccessory = this.accessories.get(uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
      existingAccessory.context.device = device;
      this.api.updatePlatformAccessories([existingAccessory]);
      new ActronAirAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new accessory:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      accessory.context.device = device;
      new ActronAirAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}
