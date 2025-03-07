/**
 * GestureView.tsx
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * MacOS-specific implementation of GestureView component.
 */
import { GestureView as BaseGestureView } from '../native-common/GestureView';
import { Types } from '../common/Interfaces';
export declare class GestureView extends BaseGestureView {
    constructor(props: Types.GestureViewProps);
    protected _getPreferredPanRatio(): number;
    protected _getEventTimestamp(e: Types.TouchEvent): number;
}
export default GestureView;
