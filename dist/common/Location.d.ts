/**
 * Location.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Methods to fetch the user's location.
 */
import * as SyncTasks from 'synctasks';
import * as RX from './Interfaces';
export declare class Location extends RX.Location {
    setConfiguration(config: RX.LocationConfiguration): void;
    isAvailable(): boolean;
    getCurrentPosition(options?: PositionOptions): SyncTasks.Promise<Position>;
    watchPosition(successCallback: RX.Types.LocationSuccessCallback, errorCallback?: RX.Types.LocationFailureCallback, options?: PositionOptions): SyncTasks.Promise<RX.Types.LocationWatchId>;
    clearWatch(watchID: RX.Types.LocationWatchId): void;
}
declare const _default: Location;
export default _default;
