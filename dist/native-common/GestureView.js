"use strict";
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
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var React = require("react");
var RN = require("react-native");
var App_1 = require("../native-common/App");
var assert_1 = require("../common/assert");
var Interfaces_1 = require("../common/Interfaces");
var Timers_1 = require("../common/utils/Timers");
var AccessibilityUtil_1 = require("./AccessibilityUtil");
var EventHelpers_1 = require("./utils/EventHelpers");
var lodashMini_1 = require("./utils/lodashMini");
var Platform_1 = require("./Platform");
var UserInterface_1 = require("./UserInterface");
var ViewBase_1 = require("./ViewBase");
var GestureType;
(function (GestureType) {
    GestureType[GestureType["None"] = 0] = "None";
    GestureType[GestureType["MultiTouch"] = 1] = "MultiTouch";
    GestureType[GestureType["Pan"] = 2] = "Pan";
    GestureType[GestureType["PanVertical"] = 3] = "PanVertical";
    GestureType[GestureType["PanHorizontal"] = 4] = "PanHorizontal";
})(GestureType || (GestureType = {}));
// These threshold values were chosen empirically.
var _pinchZoomPixelThreshold = 3;
var _panPixelThreshold = 10;
var _tapDurationThreshold = 500;
var _longPressDurationThreshold = 750;
var _tapPixelThreshold = 4;
var _doubleTapDurationThreshold = 250;
var _doubleTapPixelThreshold = 20;
var _defaultImportantForAccessibility = Interfaces_1.Types.ImportantForAccessibility.Yes;
var _isNativeMacOs = Platform_1.default.getType() === 'macos';
var GestureView = /** @class */ (function (_super) {
    __extends(GestureView, _super);
    function GestureView(props) {
        var _this = _super.call(this, props) || this;
        // State for tracking move gestures (pinch/zoom or pan)
        _this._pendingGestureType = GestureType.None;
        _this._sendTapEvent = function (e) {
            var button = EventHelpers_1.default.toMouseButton(e);
            if (button === 2) {
                // Always handle secondary button, even if context menu is not set - it shouldn't trigger onTap.
                if (_this.props.onContextMenu) {
                    var tapEvent = {
                        pageX: e.pageX,
                        pageY: e.pageY,
                        clientX: e.locationX,
                        clientY: e.locationY,
                        timeStamp: e.timeStamp,
                        isTouch: !EventHelpers_1.default.isActuallyMouseEvent(e)
                    };
                    _this.props.onContextMenu(tapEvent);
                }
            }
            else if (_this.props.onTap) {
                var tapEvent = {
                    pageX: e.pageX,
                    pageY: e.pageY,
                    clientX: e.locationX,
                    clientY: e.locationY,
                    timeStamp: e.timeStamp,
                    isTouch: !EventHelpers_1.default.isActuallyMouseEvent(e)
                };
                _this.props.onTap(tapEvent);
            }
        };
        _this._onRef = function (ref) {
            _this._view = ref || undefined;
        };
        _this._onKeyPress = function (e) {
            if (_this.props.onKeyPress) {
                _this.props.onKeyPress(EventHelpers_1.default.toKeyboardEvent(e));
            }
        };
        // Setup Pan Responder
        _this._panResponder = RN.PanResponder.create({
            onStartShouldSetPanResponder: function (e, gestureState) {
                var event = e.nativeEvent;
                UserInterface_1.default.evaluateTouchLatency(e);
                _this._lastGestureStartEvent = event;
                // If we're trying to detect a tap, set this as the responder immediately.
                if (_this.props.onTap || _this.props.onDoubleTap || _this.props.onLongPress || _this.props.onContextMenu) {
                    if (_this.props.onLongPress) {
                        _this._startLongPressTimer(event);
                    }
                    return true;
                }
                return false;
            },
            onMoveShouldSetPanResponder: function (e, gestureState) {
                var event = e.nativeEvent;
                UserInterface_1.default.evaluateTouchLatency(e);
                _this._lastGestureStartEvent = event;
                _this._pendingGestureType = _this._detectMoveGesture(event, gestureState);
                if (_this._pendingGestureType === GestureType.MultiTouch) {
                    // Handle multi-touch gestures.
                    _this._setPendingGestureState(_this._sendMultiTouchEvents(event, gestureState, true, false));
                    return true;
                }
                else if (_this._pendingGestureType === GestureType.Pan ||
                    _this._pendingGestureType === GestureType.PanVertical ||
                    _this._pendingGestureType === GestureType.PanHorizontal) {
                    // Handle a pan gesture.
                    _this._setPendingGestureState(_this._sendPanEvent(event, gestureState, _this._pendingGestureType, true, false));
                    return true;
                }
                return false;
            },
            onPanResponderRelease: function (e, gestureState) {
                _this._onPanResponderEnd(e, gestureState);
            },
            onPanResponderTerminate: function (e, gestureState) {
                _this._onPanResponderEnd(e, gestureState);
            },
            onPanResponderMove: function (e, gestureState) {
                var event = e.nativeEvent;
                UserInterface_1.default.evaluateTouchLatency(e);
                var initializeFromEvent = false;
                // If this is the first movement we've seen, try to match it against
                // the various move gestures that we're looking for.
                if (_this._pendingGestureType === GestureType.None) {
                    _this._pendingGestureType = _this._detectMoveGesture(event, gestureState);
                    initializeFromEvent = true;
                }
                if (_this._pendingGestureType === GestureType.MultiTouch) {
                    _this._setPendingGestureState(_this._sendMultiTouchEvents(event, gestureState, initializeFromEvent, false));
                }
                else if (_this._pendingGestureType === GestureType.Pan ||
                    _this._pendingGestureType === GestureType.PanVertical ||
                    _this._pendingGestureType === GestureType.PanHorizontal) {
                    _this._setPendingGestureState(_this._sendPanEvent(event, gestureState, _this._pendingGestureType, initializeFromEvent, false));
                }
            },
            // Something else wants to become responder. Should this view release the responder?
            // Returning true allows release
            onPanResponderTerminationRequest: function (e, gestureState) { return !!_this.props.releaseOnRequest; }
        });
        return _this;
    }
    GestureView.prototype.componentWillUnmount = function () {
        // Dispose of timer before the component goes away.
        this._cancelDoubleTapTimer();
    };
    GestureView.prototype._onPanResponderEnd = function (e, gestureState) {
        var event = e.nativeEvent;
        // Can't possibly be a long press if the touch ended.
        this._cancelLongPressTimer();
        // Close out any of the pending move gestures.
        if (this._pendingGestureType === GestureType.MultiTouch) {
            this._sendMultiTouchEvents(event, gestureState, false, true);
            this._pendingGestureState = undefined;
            this._pendingGestureType = GestureType.None;
        }
        else if (this._pendingGestureType === GestureType.Pan ||
            this._pendingGestureType === GestureType.PanVertical ||
            this._pendingGestureType === GestureType.PanHorizontal) {
            this._sendPanEvent(event, gestureState, this._pendingGestureType, false, true);
            this._pendingGestureState = undefined;
            this._pendingGestureType = GestureType.None;
        }
        else if (this._isTap(event)) {
            if (!this.props.onDoubleTap) {
                // If there is no double-tap handler, we can invoke the tap handler immediately.
                this._sendTapEvent(event);
            }
            else if (this._isDoubleTap(event)) {
                // This is a double-tap, so swallow the previous single tap.
                this._cancelDoubleTapTimer();
                this._sendDoubleTapEvent(event);
                this._lastTapEvent = undefined;
            }
            else {
                // This wasn't a double-tap. Report any previous single tap and start the double-tap
                // timer so we can determine whether the current tap is a single or double.
                this._reportDelayedTap();
                this._startDoubleTapTimer(event);
            }
        }
        else {
            this._reportDelayedTap();
            this._cancelDoubleTapTimer();
        }
    };
    GestureView.prototype._setPendingGestureState = function (gestureState) {
        this._reportDelayedTap();
        this._cancelDoubleTapTimer();
        this._cancelLongPressTimer();
        this._pendingGestureState = gestureState;
    };
    GestureView.prototype._detectMoveGesture = function (e, gestureState) {
        if (this._shouldRespondToPinchZoom(e, gestureState) || this._shouldRespondToRotate(e, gestureState)) {
            return GestureType.MultiTouch;
        }
        else if (this._shouldRespondToPan(gestureState)) {
            return GestureType.Pan;
        }
        else if (this._shouldRespondToPanVertical(gestureState)) {
            return GestureType.PanVertical;
        }
        else if (this._shouldRespondToPanHorizontal(gestureState)) {
            return GestureType.PanHorizontal;
        }
        return GestureType.None;
    };
    // Determines whether a touch event constitutes a tap. The "finger up"
    // event must be within a certain distance and within a certain time
    // from where the "finger down" event occurred.
    GestureView.prototype._isTap = function (e) {
        if (!this._lastGestureStartEvent) {
            return false;
        }
        var initialTimeStamp = this._getEventTimestamp(this._lastGestureStartEvent);
        var initialPageX = this._lastGestureStartEvent.pageX;
        var initialPageY = this._lastGestureStartEvent.pageY;
        var timeStamp = this._getEventTimestamp(e);
        return (timeStamp - initialTimeStamp <= _tapDurationThreshold &&
            this._calcDistance(initialPageX - e.pageX, initialPageY - e.pageY) <= _tapPixelThreshold);
    };
    // This method assumes that the caller has already determined that two
    // taps have been detected in a row with no intervening gestures. It
    // is responsible for determining if they occurred within close proximity
    // and within a certain threshold of time.
    GestureView.prototype._isDoubleTap = function (e) {
        var timeStamp = this._getEventTimestamp(e);
        if (!this._lastTapEvent) {
            return false;
        }
        return (timeStamp - this._getEventTimestamp(this._lastTapEvent) <= _doubleTapDurationThreshold &&
            this._calcDistance((this._lastTapEvent.pageX || 0) - (e.pageX || 0), (this._lastTapEvent.pageY || 0) - (e.pageY || 0)) <=
                _doubleTapPixelThreshold);
    };
    // Starts a timer that reports a previous tap if it's not canceled by a subsequent gesture.
    GestureView.prototype._startDoubleTapTimer = function (e) {
        var _this = this;
        this._lastTapEvent = e;
        this._doubleTapTimer = Timers_1.default.setTimeout(function () {
            _this._reportDelayedTap();
            _this._doubleTapTimer = undefined;
        }, _doubleTapDurationThreshold);
    };
    // Cancels any pending double-tap timer.
    GestureView.prototype._cancelDoubleTapTimer = function () {
        if (this._doubleTapTimer) {
            Timers_1.default.clearTimeout(this._doubleTapTimer);
            this._doubleTapTimer = undefined;
        }
    };
    GestureView.prototype._startLongPressTimer = function (event) {
        var _this = this;
        this._pendingLongPressEvent = event;
        this._longPressTimer = Timers_1.default.setTimeout(function () {
            _this._reportLongPress();
            _this._longPressTimer = undefined;
        }, _longPressDurationThreshold);
    };
    GestureView.prototype._cancelLongPressTimer = function () {
        if (this._longPressTimer) {
            Timers_1.default.clearTimeout(this._longPressTimer);
            this._longPressTimer = undefined;
        }
        this._pendingLongPressEvent = undefined;
    };
    // If there was a previous tap recorded but we haven't yet reported it because we were
    // waiting for a potential second tap, report it now.
    GestureView.prototype._reportDelayedTap = function () {
        if (this._lastTapEvent && this.props.onTap) {
            this._sendTapEvent(this._lastTapEvent);
            this._lastTapEvent = undefined;
        }
    };
    GestureView.prototype._reportLongPress = function () {
        if (this.props.onLongPress) {
            var tapEvent = {
                isTouch: !EventHelpers_1.default.isActuallyMouseEvent(this._pendingLongPressEvent),
                pageX: this._pendingLongPressEvent.pageX,
                pageY: this._pendingLongPressEvent.pageY,
                clientX: this._pendingLongPressEvent.locationX,
                clientY: this._pendingLongPressEvent.locationY,
                timeStamp: this._pendingLongPressEvent.timeStamp
            };
            this.props.onLongPress(tapEvent);
        }
        this._pendingLongPressEvent = undefined;
    };
    GestureView.prototype._shouldRespondToPinchZoom = function (e, gestureState) {
        if (!this.props.onPinchZoom) {
            return false;
        }
        // Do we see two touches?
        if (!e.touches || e.touches.length !== 2) {
            return false;
        }
        // Has the user started to pinch or zoom?
        if (this._calcDistance(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY) >=
            _pinchZoomPixelThreshold) {
            return true;
        }
        return false;
    };
    GestureView.prototype._shouldRespondToRotate = function (e, gestureState) {
        if (!this.props.onRotate) {
            return false;
        }
        // Do we see two touches?
        if (!e.touches || e.touches.length !== 2) {
            return false;
        }
        return true;
    };
    GestureView.prototype._shouldRespondToPan = function (gestureState) {
        if (!this.props.onPan) {
            return false;
        }
        // Has the user started to pan?
        var panThreshold = (!lodashMini_1.isUndefined(this.props.panPixelThreshold) && this.props.panPixelThreshold > 0) ?
            this.props.panPixelThreshold : _panPixelThreshold;
        return (this._calcDistance(gestureState.dx, gestureState.dy) >= panThreshold);
    };
    GestureView.prototype._shouldRespondToPanVertical = function (gestureState) {
        if (!this.props.onPanVertical) {
            return false;
        }
        // Has the user started to pan?
        var panThreshold = (!lodashMini_1.isUndefined(this.props.panPixelThreshold) && this.props.panPixelThreshold > 0) ?
            this.props.panPixelThreshold : _panPixelThreshold;
        var isPan = Math.abs(gestureState.dy) >= panThreshold;
        if (isPan && this.props.preferredPan === Interfaces_1.Types.PreferredPanGesture.Horizontal) {
            return Math.abs(gestureState.dy) > Math.abs(gestureState.dx * this._getPreferredPanRatio());
        }
        return isPan;
    };
    GestureView.prototype._shouldRespondToPanHorizontal = function (gestureState) {
        if (!this.props.onPanHorizontal) {
            return false;
        }
        // Has the user started to pan?
        var panThreshold = (!lodashMini_1.isUndefined(this.props.panPixelThreshold) && this.props.panPixelThreshold > 0) ?
            this.props.panPixelThreshold : _panPixelThreshold;
        var isPan = Math.abs(gestureState.dx) >= panThreshold;
        if (isPan && this.props.preferredPan === Interfaces_1.Types.PreferredPanGesture.Vertical) {
            return Math.abs(gestureState.dx) > Math.abs(gestureState.dy * this._getPreferredPanRatio());
        }
        return isPan;
    };
    GestureView.prototype._calcDistance = function (dx, dy) {
        return Math.sqrt(dx * dx + dy * dy);
    };
    GestureView.prototype._calcAngle = function (touches) {
        var a = touches[0];
        var b = touches[1];
        var degrees = this._radiansToDegrees(Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX));
        if (degrees < 0) {
            degrees += 360;
        }
        return degrees;
    };
    GestureView.prototype._radiansToDegrees = function (rad) {
        return rad * 180 / Math.PI;
    };
    GestureView.prototype._sendMultiTouchEvents = function (e, gestureState, initializeFromEvent, isComplete) {
        var p = this._pendingGestureState;
        var multiTouchEvent;
        // If the user lifted up one or both fingers, the multitouch gesture
        // is halted. Just return the existing gesture state.
        if (!e.touches || e.touches.length !== 2) {
            multiTouchEvent = p;
            p.isComplete = isComplete;
        }
        else {
            var centerPageX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
            var centerPageY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
            var centerClientX = (e.touches[0].locationX + e.touches[1].locationX) / 2;
            var centerClientY = (e.touches[0].locationY + e.touches[1].locationY) / 2;
            var width = Math.abs(e.touches[0].pageX - e.touches[1].pageX);
            var height = Math.abs(e.touches[0].pageY - e.touches[1].pageY);
            var distance = this._calcDistance(width, height);
            var angle = this._calcAngle(e.touches);
            var initialCenterPageX = initializeFromEvent ? centerPageX : p.initialCenterPageX;
            var initialCenterPageY = initializeFromEvent ? centerPageY : p.initialCenterPageY;
            var initialCenterClientX = initializeFromEvent ? centerClientX : p.initialCenterClientX;
            var initialCenterClientY = initializeFromEvent ? centerClientY : p.initialCenterClientY;
            var initialWidth = initializeFromEvent ? width : p.initialWidth;
            var initialHeight = initializeFromEvent ? height : p.initialHeight;
            var initialDistance = initializeFromEvent ? distance : p.initialDistance;
            var initialAngle = initializeFromEvent ? angle : p.initialAngle;
            var velocityX = initializeFromEvent ? 0 : gestureState.vx;
            var velocityY = initializeFromEvent ? 0 : gestureState.vy;
            multiTouchEvent = {
                initialCenterPageX: initialCenterPageX,
                initialCenterPageY: initialCenterPageY,
                initialCenterClientX: initialCenterClientX,
                initialCenterClientY: initialCenterClientY,
                initialWidth: initialWidth,
                initialHeight: initialHeight,
                initialDistance: initialDistance,
                initialAngle: initialAngle,
                centerPageX: centerPageX,
                centerPageY: centerPageY,
                centerClientX: centerClientX,
                centerClientY: centerClientY,
                velocityX: velocityX,
                velocityY: velocityY,
                width: width,
                height: height,
                distance: distance,
                angle: angle,
                isComplete: isComplete,
                timeStamp: e.timeStamp,
                isTouch: !EventHelpers_1.default.isActuallyMouseEvent(e)
            };
        }
        if (this.props.onPinchZoom) {
            this.props.onPinchZoom(multiTouchEvent);
        }
        if (this.props.onRotate) {
            this.props.onRotate(multiTouchEvent);
        }
        return multiTouchEvent;
    };
    GestureView.prototype._sendPanEvent = function (e, gestureState, gestureType, initializeFromEvent, isComplete) {
        var state = this._pendingGestureState;
        var pageX = e.pageX;
        var pageY = e.pageY;
        var clientX = e.locationX;
        var clientY = e.locationY;
        // Grab the first touch. If the user adds additional touch events,
        // we will ignore them. If we use e.pageX/Y, we will be using the average
        // of the touches, so we'll see a discontinuity.
        if (e.touches && e.touches.length > 0) {
            pageX = e.touches[0].pageX;
            pageY = e.touches[0].pageY;
            clientX = e.touches[0].locationX;
            clientY = e.touches[0].locationY;
        }
        assert_1.default(this._lastGestureStartEvent, 'Gesture start event must not be null.');
        var initialPageX = this._lastGestureStartEvent
            ? this._lastGestureStartEvent.pageX
            : initializeFromEvent ? pageX : state.initialPageX;
        var initialPageY = this._lastGestureStartEvent
            ? this._lastGestureStartEvent.pageY
            : initializeFromEvent ? pageY : state.initialPageY;
        var initialClientX = this._lastGestureStartEvent
            ? this._lastGestureStartEvent.locationX
            : initializeFromEvent ? clientX : state.initialClientX;
        var initialClientY = this._lastGestureStartEvent
            ? this._lastGestureStartEvent.locationY
            : initializeFromEvent ? clientY : state.initialClientY;
        var velocityX = initializeFromEvent ? 0 : gestureState.vx;
        var velocityY = initializeFromEvent ? 0 : gestureState.vy;
        var panEvent = {
            initialPageX: initialPageX,
            initialPageY: initialPageY,
            initialClientX: initialClientX,
            initialClientY: initialClientY,
            pageX: pageX,
            pageY: pageY,
            clientX: clientX,
            clientY: clientY,
            velocityX: velocityX,
            velocityY: velocityY,
            isComplete: isComplete,
            timeStamp: e.timeStamp,
            isTouch: !EventHelpers_1.default.isActuallyMouseEvent(this._lastGestureStartEvent)
        };
        switch (gestureType) {
            case GestureType.Pan:
                if (this.props.onPan) {
                    this.props.onPan(panEvent);
                }
                break;
            case GestureType.PanVertical:
                if (this.props.onPanVertical) {
                    this.props.onPanVertical(panEvent);
                }
                break;
            case GestureType.PanHorizontal:
                if (this.props.onPanHorizontal) {
                    this.props.onPanHorizontal(panEvent);
                }
                break;
            default:
            // do nothing;
        }
        return panEvent;
    };
    GestureView.prototype._sendDoubleTapEvent = function (e) {
        // If user did a double click with different mouse buttons, eg. left (50ms) right
        // both clicks need to be registered as separate events.
        var lastButton = EventHelpers_1.default.toMouseButton(this._lastTapEvent);
        var button = EventHelpers_1.default.toMouseButton(e);
        if (lastButton !== button || button === 2) {
            this._sendTapEvent(this._lastTapEvent);
            this._sendTapEvent(e);
            return;
        }
        if (this.props.onDoubleTap) {
            var tapEvent = {
                pageX: e.pageX,
                pageY: e.pageY,
                clientX: e.locationX,
                clientY: e.locationY,
                timeStamp: e.timeStamp,
                isTouch: !EventHelpers_1.default.isActuallyMouseEvent(e)
            };
            this.props.onDoubleTap(tapEvent);
        }
    };
    GestureView.prototype.render = function () {
        var importantForAccessibility = AccessibilityUtil_1.default.importantForAccessibilityToString(this.props.importantForAccessibility, _defaultImportantForAccessibility);
        var accessibilityTrait = AccessibilityUtil_1.default.accessibilityTraitToString(this.props.accessibilityTraits);
        var accessibilityComponentType = AccessibilityUtil_1.default.accessibilityComponentTypeToString(this.props.accessibilityTraits);
        var extendedProps = {
            onFocus: this.props.onFocus,
            onBlur: this.props.onBlur,
            onKeyPress: this.props.onKeyPress ? this._onKeyPress : undefined
        };
        if (_isNativeMacOs && App_1.default.supportsExperimentalKeyboardNavigation && this.props.onTap) {
            extendedProps.onClick = this._sendTapEvent;
            if (this.props.tabIndex === undefined || this.props.tabIndex >= 0) {
                extendedProps.acceptsKeyboardFocus = true;
                extendedProps.enableFocusRing = true;
            }
        }
        return (React.createElement(RN.View, __assign({ ref: this._onRef, style: [ViewBase_1.default.getDefaultViewStyle(), this.props.style], importantForAccessibility: importantForAccessibility, accessibilityTraits: accessibilityTrait, accessibilityComponentType: accessibilityComponentType, accessibilityLabel: this.props.accessibilityLabel, testID: this.props.testId }, this._panResponder.panHandlers, extendedProps), this.props.children));
    };
    GestureView.prototype.focus = function () {
        if (this._view && this._view.focus) {
            this._view.focus();
        }
    };
    GestureView.prototype.blur = function () {
        if (this._view && this._view.blur) {
            this._view.blur();
        }
    };
    return GestureView;
}(React.Component));
exports.GestureView = GestureView;
exports.default = GestureView;
