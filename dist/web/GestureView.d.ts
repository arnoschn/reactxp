/**
 * GestureView.tsx
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Web-specific implementation of the cross-platform GestureView component.
 * It provides support for the scroll wheel, clicks and double clicks.
 */
import * as React from 'react';
import { Types } from '../common/Interfaces';
export interface GestureViewContext {
    isInRxMainView?: boolean;
}
export declare class GestureView extends React.Component<Types.GestureViewProps, Types.Stateless> {
    private _id;
    private _isMounted;
    private _container;
    private _pendingLongPressEvent;
    private _longPressTimer;
    private _doubleTapTimer;
    private _lastTapEvent;
    private _responder;
    private _pendingGestureType;
    private _gestureTypeLocked;
    private _skipNextTap;
    static contextTypes: React.ValidationMap<any>;
    componentDidMount(): void;
    componentWillUnmount(): void;
    render(): JSX.Element;
    blur(): void;
    focus(): void;
    protected _getContainer(): HTMLElement | null;
    private _createMouseResponder;
    private _disposeMouseResponder;
    private _setContainerRef;
    private _getStyles;
    private _onMouseDown;
    private _onTouchStart;
    private _onTouchEnd;
    private _onClick;
    private _sendContextMenuEvent;
    private _detectGestureType;
    private _getPanPixelThreshold;
    private _shouldRespondToPan;
    private _shouldRespondToPanVertical;
    private _shouldRespondToPanHorizontal;
    private _onWheel;
    private _calcDistance;
    private _isDoubleTap;
    private _startLongPressTimer;
    private _cancelLongPressTimer;
    private _startDoubleTapTimer;
    private _cancelDoubleTapTimer;
    private _reportDelayedTap;
    private _reportLongPress;
    private _sendTapEvent;
    private _sendDoubleTapEvent;
    private _sendPanEvent;
    private _getGestureViewClientRect;
}
export default GestureView;
