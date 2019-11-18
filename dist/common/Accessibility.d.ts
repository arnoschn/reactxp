/**
 * Accessibility.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Common wrapper for accessibility helper exposed from ReactXP.
 */
import * as RX from '../common/Interfaces';
export declare abstract class Accessibility extends RX.Accessibility {
    abstract isScreenReaderEnabled(): boolean;
    screenReaderChangedEvent: any;
    isHighContrastEnabled(): boolean;
    newAnnouncementReadyEvent: any;
    announceForAccessibility(announcement: string): void;
}
export default Accessibility;
