/**
 * GestureView.tsx
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * RN-specific implementation of the cross-platform GestureView component.
 * It provides much of the standard work necessary to support combinations of
 * pinch-and-zoom, panning, single tap and double tap gestures.
 */
import * as React from 'react';
import { Types } from '../common/Interfaces';
export declare abstract class GestureView extends React.Component<Types.GestureViewProps, Types.Stateless> {
    private _panResponder;
    private _doubleTapTimer;
    private _pendingLongPressEvent;
    private _longPressTimer;
    private _pendingGestureType;
    private _pendingGestureState;
    private _lastTapEvent;
    private _lastGestureStartEvent;
    private _view;
    constructor(props: Types.GestureViewProps);
    componentWillUnmount(): void;
    protected abstract _getPreferredPanRatio(): number;
    protected abstract _getEventTimestamp(e: Types.TouchEvent): number;
    private _onPanResponderEnd;
    private _setPendingGestureState;
    private _detectMoveGesture;
    private _isTap;
    private _isDoubleTap;
    private _startDoubleTapTimer;
    private _cancelDoubleTapTimer;
    private _startLongPressTimer;
    private _cancelLongPressTimer;
    private _reportDelayedTap;
    private _reportLongPress;
    private _shouldRespondToPinchZoom;
    private _shouldRespondToRotate;
    private _shouldRespondToPan;
    private _shouldRespondToPanVertical;
    private _shouldRespondToPanHorizontal;
    private _calcDistance;
    private _calcAngle;
    private _radiansToDegrees;
    private _sendMultiTouchEvents;
    private _sendPanEvent;
    private _sendTapEvent;
    private _sendDoubleTapEvent;
    render(): JSX.Element;
    private _onRef;
    private _onKeyPress;
    focus(): void;
    blur(): void;
}
export default GestureView;
