/**
 * Linking.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * RN-specific implementation for deep linking.
 */
import * as SyncTasks from 'synctasks';
import { Types } from '../common/Interfaces';
import { Linking as CommonLinking } from '../common/Linking';
export declare class Linking extends CommonLinking {
    constructor();
    protected _openUrl(url: string): SyncTasks.Promise<void>;
    getInitialUrl(): SyncTasks.Promise<string | undefined>;
    launchEmail(emailInfo: Types.EmailInfo): SyncTasks.Promise<void>;
}
declare const _default: Linking;
export default _default;
