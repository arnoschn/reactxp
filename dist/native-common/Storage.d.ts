/**
 * Storage.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Native implementation of the cross-platform database storage abstraction.
 */
import * as SyncTasks from 'synctasks';
import * as RX from '../common/Interfaces';
export declare class Storage extends RX.Storage {
    getItem(key: string): SyncTasks.Promise<string | undefined>;
    setItem(key: string, value: string): SyncTasks.Promise<void>;
    removeItem(key: string): SyncTasks.Promise<void>;
    clear(): SyncTasks.Promise<void>;
}
declare const _default: Storage;
export default _default;
