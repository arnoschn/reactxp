/**
 * VirtualListView.tsx
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * A cross-platform virtualized list view supporting variable-cachedWidth items and
 * methods to navigate to specific items by index.
 *
 * Misc notes to help understand the flow:
 * 1. There are only a few ways to enter calculation flows:
 *    * _updateStateFromProps: We got new props
 *    * _onLayoutContainer: Our outer container rendered and/or changed size
 *    * _onLayoutItem: An item rendered and/or changed changed size
 *    * _onScroll: The user scrolled the container
 *    Everything else is a helper function for these four entry points.
 * 2. We largely ignore the React lifecycle here. We completely eschew state in favor of forceUpdate when
 *    we know that we need to  call render(). We cheat and use the animation code to move items and make
 *    them opaque/invisible at the right time outside of the render cycle.
 * 3. Items are rendered in containers called "cells". Cells are allocated on demand and given their own keys.
 *    When an item is no longer within the view port (e.g. in response to the the user scrolling), the corresponding
 *    cell is recycled to avoid unmounting and mounting. These recycled cells are rendered in a position that is
 *    not visible to the user. When a new cell is needed, we consult the recycled cell list to find one that matches
 *    the specified "template" of the new item. Callers should set the template field in a way that all similar items
 *     share the same template. This will minimize the amount of work that React needs to be done to reuse the recycled
 *    cell.
 * 3. The intended render flow is as follows:
 *    * Start filling hidden items from top down
 *    * Wait for items to be measured (or if widths are known, then bypass this step)
 *    * Set the translation of all items such that they appear in view at the same time without new items popping
 *      into existence afterward.
 * 4. We address the issue of unexpected item widths tracking _widthLeftRenderAdjustment. When this is
 *    non-zero, it means that our initial guess for one or more items was wrong, so the _containerWidth is
 *    currently incorrect. Correcting this is an expensive and potentially disruptive action because it
 *    involves setting the container width, repositioning all visible cells and setting the scroll
 *    position all in the same frame if possible.
 */

import * as _ from 'lodash';
import { createRef, RefObject } from 'react';
import * as RX from 'reactxp';
import ScrollViewConfig from 'reactxp/dist/web/ScrollViewConfig';

import assert from './assert';
import { VirtualListCell, VirtualListCellInfo, VirtualListCellRenderDetails } from './VirtualListCell';
ScrollViewConfig.setUseCustomScrollbars(true);

// Specifies information about each item to be displayed in the list.
export interface VirtualListViewItemInfo extends VirtualListCellInfo {
    // Specifies the known width of the item or a best guess if the width isn't known.
    width: number;
    height: number;
    // Specifies that the width is not known and needs to be measured dynamically.
    // This has a big perf overhead because it requires a double layout (once offscreen
    // to measure the item). It also disables cell recycling. Wherever possible, it
    // should be avoided, especially for perf-critical views.
    measureWidth?: boolean;

    // Specify the same "template" string for items that are rendered
    // with identical or similar view hierarchies. When a template is specified,
    // the list view attempts to recycle cells whose templates match. When an item
    // scrolls off the screen and others appear on screen, the contents of the
    // cell are simply updated rather than torn down and rebuilt.
    template?: string;

    // Is the item navigable by keyboard or through accessibility mechanisms?
    isNavigable?: boolean;
}

export interface VirtualListViewCellRenderDetails<T extends VirtualListViewItemInfo> extends VirtualListCellRenderDetails<T> {

}

export interface VirtualListViewProps<ItemInfo extends VirtualListViewItemInfo> extends
        RX.CommonStyledProps<RX.Types.ViewStyleRuleSet, VirtualListViewHorizontal<ItemInfo>> {
    testId?: string;

    // Ordered list of descriptors for items to display in the list.
    itemList: ItemInfo[];

    // Callback for rendering item when it becomes visible within view port.
    renderItem: (renderDetails: VirtualListCellRenderDetails<ItemInfo>) => JSX.Element | JSX.Element[];
    onItemSelected?: (item: ItemInfo) => void;
    onItemFocused?: (item: ItemInfo | undefined) => void;

    initialSelectedKey?: string;

    // Optional padding around the scrolling content within the list.
    padding?: number;

    // If true, allows each item to overflow its visible cell boundaries; by default,
    // item contents are clipped to cell boundaries.
    showOverflow?: boolean;

    // Should the list animate additions, removals and moves within the list?
    animateChanges?: boolean;
    verticalScroll?: boolean;
    // By default, VirtualListView re-renders every item during the render. Setting
    // this flag to true allows the list view to re-render only items from itemList
    // whose descriptor has changed, thus avoiding unnecessary rendering. It uses
    // _.isEqual to perform this check. In this mode, renderItem should not depend
    // on any external state, only on VirtualListViewItemInfo, to render item.
    skipRenderIfItemUnchanged?: boolean;

    // Pass-through properties for scroll view.
    keyboardDismissMode?: 'none' | 'interactive' | 'on-drag';
    keyboardShouldPersistTaps?: boolean;
    disableScrolling?: boolean;
    scrollsToTop?: boolean; // iOS only, scroll to top when user taps on status bar
    disableBouncing?: boolean; // iOS only, bounce override
    scrollIndicatorInsets?: {
        top: number;
        left: number;
        bottom: number;
        right: number;
    }; // iOS only
    scrollEventThrottle?: number;
    onScroll?: (scrollTop: number, scrollLeft: number) => void;
    onLayout?: (e: RX.Types.ViewOnLayoutEvent) => void;
    scrollXAnimatedValue?: RX.Types.AnimatedValue;
    scrollYAnimatedValue?: RX.Types.AnimatedValue;

    // Use this if you want to vertically offset the focused item when using keyboard nav
    keyboardFocusScrollOffset?: number;

    // Logging callback to debug issues related to the VirtualListView.
    logInfo?: (textToLog: string) => void;
}

export interface VirtualListViewState {
    lastFocusedItemKey?: string;
    isFocused?: boolean;
    selectedItemKey?: string;
}

export interface VirtualCellInfo<ItemInfo extends VirtualListViewItemInfo> {
    cellRef: RefObject<VirtualListCell<ItemInfo>>;
    virtualKey: string;
    itemTemplate?: string;
    isWidthConstant: boolean;
    width: number;
    height: number;
    cachedItemKey: string;
    left: number;
    isVisible: boolean;
    shouldUpdate: boolean;
}

enum FocusDirection {
    Up = -1,
    Down = 1
}

const _styles = {
    scrollContainer: RX.Styles.createScrollViewStyle({
        flex: 1,
        position: 'relative',
        flexDirection: 'column'
    }),
    staticContainer: RX.Styles.createViewStyle({
        flex: 1,
        flexDirection: 'column'
    })
};

const _isNativeAndroid = RX.Platform.getType() === 'android';
const _isNativeIOS = RX.Platform.getType() === 'ios';
const _isNativeMacOs = RX.Platform.getType() === 'macos';
const _isWeb = RX.Platform.getType() === 'web';

// How many items with unknown widths will we allow? A larger value will fill the view more
// quickly but will result in a bunch of long-running work that can cause frame skips during
// animations.
const _maxSimultaneousMeasures = 16;

// Recycled cells remain mounted to reduce the allocations and deallocations.
// This value controls how many we maintain before culling.
const _maxRecycledCells = 50;

const _maxRecycledCellsForAccessibility = 0;

const _virtualKeyPrefix = 'vc_';
const _accessibilityVirtualKeyPrefix = 'ac_';

// Key codes used on web/RN (keycodes for arrows are different between web and native, unfortunately)
// (a resolution for https://github.com/Microsoft/reactxp/issues/419 will make this look better, hopefuly)
const _keyCodeUpArrow = _isWeb ? 38 : 19;
const _keyCodeDownArrow = _isWeb ? 40 : 20;

// tslint:disable:override-calls-super
export class VirtualListViewHorizontal<ItemInfo extends VirtualListViewItemInfo>
    extends RX.Component<VirtualListViewProps<ItemInfo>, VirtualListViewState> {

    private _lastScrollLeft = 0;
    private _lastScrollTop = 0;
    private _layoutHeight = 0;
    private _layoutWidth = 0;

    // Cache the width for rendered items for reuse/optimization
    private _contentHeight = -1;
    private _itemHeight = -1;
    private _lastItemHeight = -1;
    private _isMounted = false;

    // Controls the full width of the scrolling view, independent of the view port width
    private _containerWidth = 0;
    private _containerWidthValue = RX.Animated.createValue(this._containerWidth);
    private _containerAnimatedStyle = RX.Styles.createAnimatedViewStyle({
        width: this._containerWidthValue
    });

    // A dictionary of items that maps item keys to item indexes.
    private _itemMap = new Map<string, number>();

    private _scrollViewRef = createRef<RX.ScrollView>();

    // When we need to actually re-render, mark this until it's resolved
    private _isRenderDirty = false;

    // Number of pending item animations. We defer some actions while animations are pending.
    private _pendingAnimations = new Set<string>();
    // We attempt to guess the size of items before we render them, but if we're wrong, we need to accumulate the guess
    // error so that we can correct it later.
    private _widthLeftRenderAdjustment = 0;

    // Cache the widths of blocks of the list
    private _widthLeftRenderBlock = 0;
    private _widthOfRenderBlock = 0;
    private _widthRightRenderBlock = 0;

    // Count the number of items above, in, and below the render block
    private _itemsAboveRenderBlock = 0;
    private _itemsInRenderBlock = 0;
    private _itemsBelowRenderBlock = 0;

    // Items that we're waiting on a measure from
    private _pendingMeasurements = new Set<string>();

    // We first render items to fill the visible screen, and then render past it in another render pass.
    private _isInitialFillComplete = false;

    // Save a width cache of things that are no longer being rendered because we may scroll them off screen and still
    // want to know what their width is to calculate the size.
    private _widthCache = new Map<string, number>();

    // Next cell key. We keep incrementing this value so we always generate unique keys.
    private static _nextCellKey = 1;

    // Cells that contain visible items.
    private _activeCells = new Map<string, VirtualCellInfo<ItemInfo>>();

    // Cells that were previously allocated but no longer contain items that are visible.
    // They are kept around and reused to avoid exceess allocations.
    private _recycledCells: VirtualCellInfo<ItemInfo>[] = [];

    // List of cells that are rendered
    private _navigatableItemsRendered: {
        key: string;
        vc_key: string;
    }[] = [];

    private _pendingFocusDirection: FocusDirection | undefined;

    // Recycled cells remain mounted to reduce the allocations and deallocations.
    // This value controls how many we maintain before culling.
    private _maxRecycledCells = _maxRecycledCells;

    private _isScreenReaderEnabled = false;

    // Fraction of screen width that we render above and below the visible screen.
    private _renderOverdrawFactor = 0.5;
    private _minOverdrawAmount = 512;
    private _maxOverdrawAmount = 4096;

    // These must be at least as big as the numbers above to avoid feedback loops.
    private _cullFraction = 1.0;
    private _minCullAmount = this._minOverdrawAmount * 2;

    constructor(props: VirtualListViewProps<ItemInfo>) {
        super(props);

        this._updateStateFromProps(props, true);
        this.state = {

            lastFocusedItemKey: _.some(props.itemList, item => item.key === props.initialSelectedKey) ?
                props.initialSelectedKey :
                undefined,
            selectedItemKey: _.some(props.itemList, item => item.key === props.initialSelectedKey) ?
                props.initialSelectedKey :
                undefined
        };
    }

    componentWillReceiveProps(nextProps: VirtualListViewProps<ItemInfo>): void {
        if (!_.isEqual(this.props, nextProps)) {
            this._updateStateFromProps(nextProps, false);
        }
    }

    componentWillUpdate(nextProps: VirtualListViewProps<ItemInfo>, nextState: VirtualListViewState) {
        const updatedState: Partial<VirtualListViewState> = {};
        let updateState = false;
        if (nextState.lastFocusedItemKey && !_.some(nextProps.itemList, item => item.key === nextState.lastFocusedItemKey)) {
            updateState = true;
            updatedState.lastFocusedItemKey = undefined;
        }
        if (nextState.selectedItemKey && !_.some(nextProps.itemList, item => item.key === nextState.selectedItemKey)) {
            updateState = true;
            updatedState.selectedItemKey = undefined;
        }

        if (updateState) {
            this.setState(updatedState);
        }
    }

    private _setupForAccessibility() {
        if (this.props.logInfo) {
            this.props.logInfo('Screen reader enabled.');
        }
        this._isScreenReaderEnabled = true;

        if (_isNativeIOS || _isNativeAndroid) {
            // Clear recycled cells and turn off recycling.
            if (this._recycledCells.length > 0) {
                this._recycledCells = [];
                this._isRenderDirty = true;
            }

            this._maxRecycledCells = _maxRecycledCellsForAccessibility;
        }
    }

    private _tearDownForAccessibility() {
        if (this.props.logInfo) {
            this.props.logInfo('Screen reader disabled.');
        }

        this._isScreenReaderEnabled = false;

        if (_isNativeIOS || _isNativeAndroid) {
            // Enable recycling.
            this._maxRecycledCells = _maxRecycledCells;
        }
    }

    private _isAndroidScreenReaderEnabled() {
        return this._isScreenReaderEnabled && _isNativeAndroid;
    }

    private _updateStateFromProps(props: VirtualListViewProps<ItemInfo>, initialBuild: boolean) {
        if (props.logInfo) {
            props.logInfo('Rebuilding VirtualListView State - initial: ' + initialBuild +
                ', items: ' + props.itemList.length);
        }

        if (initialBuild && props.skipRenderIfItemUnchanged) {
            // When we are using smart rerender we can make overdraw much larger
            this._renderOverdrawFactor = 5;
            this._minOverdrawAmount = 2048;
            this._maxOverdrawAmount = 4096;
            this._cullFraction = 6;
            this._minCullAmount = 3072;
        }

        if (initialBuild || !_.isEqual(this.props.itemList, props.itemList)) {
            this._handleItemListChange(props);
            this._calcNewRenderedItemState(props);
        }

        this._renderIfDirty(props);
    }

    private _handleItemListChange(props: VirtualListViewProps<ItemInfo>) {
        // Build a new item map.
        const newItemMap = new Map<string, number>();
        let itemIndex = -1;
        for (const item of props.itemList) {
            itemIndex++;
            // Make sure there are no duplicate keys.
            if (newItemMap.has(item.key)) {
                assert(false, 'Found a duplicate key: ' + item.key);
                if (props.logInfo) {
                    props.logInfo('Item with key ' + item.key + ' is duplicated at positions ' + itemIndex +
                        ' and ' + newItemMap.get(item.key)!);
                }
            }
            newItemMap.set(item.key, itemIndex);

            if (this.props && this.props.itemList) {
                const cell = this._activeCells.get(item.key);
                if (cell) {
                    const oldItemIndex = this._itemMap.get(item.key);
                    if (oldItemIndex === undefined) {
                        cell.shouldUpdate = true;
                    } else {
                        const oldItem = this.props.itemList[oldItemIndex];
                        if (this.props.skipRenderIfItemUnchanged || !_.isEqual(oldItem, item)) {
                            cell.shouldUpdate = true;
                        }
                    }
                }
            }
        }

        // Stop tracking the widths of deleted items.
        const oldItems = (this.props && this.props.itemList) ? this.props.itemList : [];
        itemIndex = -1;
        for (const item of oldItems) {
            itemIndex++;
            if (!newItemMap.has(item.key)) {
                // If we're deleting an item that's above the current render block,
                // update the adjustment so we avoid an unnecessary scroll.

                // Update focused item if it's the one removed, if we're unable to, reset focus
                if (item.key === this.state.lastFocusedItemKey) {
                    if (!this._focusSubsequentItem(FocusDirection.Down, false, false) &&
                            !this._focusSubsequentItem(FocusDirection.Up, false, false)) {
                        this.setState({ lastFocusedItemKey: undefined });
                    }
                }

                if (itemIndex < this._itemsAboveRenderBlock) {
                    this._widthLeftRenderAdjustment += this._getWidthOfItem(oldItems[itemIndex]);
                }

                this._widthCache.delete(item.key);
                this._pendingMeasurements.delete(item.key);

                // Recycle any deleted active cells up front so they can be recycled below.
                if (this._activeCells.has(item.key)) {
                    this._recycleCell(item.key);
                }
            }
        }

        const overdrawAmount = this._calcOverdrawAmount();
        const renderBlockLeftLimit = this._lastScrollLeft - overdrawAmount;
        const renderBlockRightLimit = this._lastScrollLeft + this._layoutWidth + overdrawAmount;

        let xPosition = this._widthLeftRenderAdjustment;
        let lookingForStartOfRenderBlock = true;

        this._itemsAboveRenderBlock = 0;
        this._itemsInRenderBlock = 0;

        // Determine the new bounds of the render block.
        itemIndex = -1;
        for (const item of props.itemList) {
            itemIndex++;
            const itemWidth = this._getWidthOfItem(item);

            xPosition += itemWidth;

            if (xPosition <= renderBlockLeftLimit) {
                if (this._activeCells.has(item.key)) {
                    this._recycleCell(item.key);
                }
            } else {
                if (lookingForStartOfRenderBlock) {
                    this._itemsAboveRenderBlock = itemIndex;
                    lookingForStartOfRenderBlock = false;
                }

                if (xPosition - itemWidth < renderBlockRightLimit) {
                    // We're within the render block.
                    this._itemsInRenderBlock++;

                    if (this._activeCells.has(item.key)) {
                        this._setCellLeftAndVisibility(item.key, this._shouldShowItem(item, props),
                            xPosition - itemWidth, !!props.animateChanges);
                    } else {
                        this._allocateCell(item.key, item.template, itemIndex, !item.measureWidth, item.width, item.height,
                            xPosition - itemWidth, this._shouldShowItem(item, props));

                        if (!this._isItemWidthKnown(item)) {
                            this._pendingMeasurements.add(item.key);
                        }
                    }
                } else {
                    // We're past the render block.
                    if (this._activeCells.has(item.key)) {
                        this._recycleCell(item.key);
                    }
                }
            }
        }

        // Replace the item map with the updated version.
        this._itemMap = newItemMap;

        this._itemsBelowRenderBlock = props.itemList.length - this._itemsAboveRenderBlock -
            this._itemsInRenderBlock;
        this._widthLeftRenderBlock = this._calcWidthOfItems(props, 0, this._itemsAboveRenderBlock - 1);
        this._widthOfRenderBlock = this._calcWidthOfItems(props, this._itemsAboveRenderBlock,
            this._itemsAboveRenderBlock + this._itemsInRenderBlock - 1);
        this._widthRightRenderBlock = this._calcWidthOfItems(props,
            this._itemsAboveRenderBlock + this._itemsInRenderBlock, props.itemList.length - 1);

        // Pre-populate the container width with known values early - if there are dynamically sized items in the list, this will be
        // corrected during the onLayout phase
        if (this._containerWidth === 0) {
            this._containerWidth = this._widthLeftRenderBlock + this._widthOfRenderBlock + this._widthRightRenderBlock;
            this._containerWidthValue.setValue(this._containerWidth);
        }
    }

    private _calcOverdrawAmount() {
        return this._isInitialFillComplete ?
            Math.min(Math.max(this._layoutWidth * this._renderOverdrawFactor, this._minOverdrawAmount), this._maxOverdrawAmount) :
            0;
    }

    private _onLayoutContainer = (e: RX.Types.ViewOnLayoutEvent) => {
        if (!this._isMounted) {
            return;
        }

        let layoutWidth = e.width;
        if (this.props.padding) {
            layoutWidth -= this.props.padding;
        }
        const layoutHeight = e.height;

        if (layoutHeight !== this._layoutHeight) {
            if (this.props.logInfo) {
                this.props.logInfo('New layout height: ' + layoutHeight);
            }

            this._layoutHeight = layoutHeight;
            this._resizeAllItems(this.props);
        }

        if (layoutWidth !== this._layoutWidth) {
            if (this.props.logInfo) {
                this.props.logInfo('New layout width: ' + layoutWidth);
            }

            this._layoutWidth = layoutWidth;
            this._calcNewRenderedItemState(this.props);
            this._renderIfDirty(this.props);

            // See if we have accumulated enough error to require an adjustment.
            this._reconcileCorrections(this.props);
        }

        if (this.props.onLayout) {
            this.props.onLayout(e);
        }
    }

    private _onLayoutItem = (itemKey: string, newWidth: number) => {
        if (!this._isMounted) {
            return;
        }

        const itemIndex = this._itemMap.get(itemKey);

        // Because this event is async on some platforms, the index may have changed or
        // the item could have been removed by the time the event arrives.
        if (itemIndex === undefined) {
            return;
        }

        const item = this.props.itemList[itemIndex];
        const oldWidth = this._getWidthOfItem(item);

        if (!item.measureWidth) {
            // Trust constant-width items, even if the layout tells us otherwise.
            // We shouldn't even get this callback, since we don't specify an onLayout in this case.
            if (this.props.logInfo) {
                this.props.logInfo('Item ' + itemKey + ' listed as known width (' + oldWidth +
                    '), but got an itemOnLayout anyway? (Reported width: ' + newWidth + ')');
            }
            return;
        }

        this._widthCache.set(itemKey, newWidth);

        if (itemIndex < this._itemsAboveRenderBlock || itemIndex >= this._itemsAboveRenderBlock + this._itemsInRenderBlock) {
            // Getting a response for a culled item (no longer in tracked render block), so track the width but don't update anything.
            return;
        }

        let needsRecalc = false;

        if (oldWidth !== newWidth) {
            if (this.props.logInfo) {
                this.props.logInfo('onLayout: Item width Changed: ' + itemKey + ' - Old: ' + oldWidth + ', New: ' + newWidth);
            }

            this._widthOfRenderBlock += (newWidth - oldWidth);

            if (this._isInitialFillComplete) {
                // See if there are any visible items before this one.
                let foundVisibleItemBefore = false;
                for (let i = this._itemsAboveRenderBlock; i < this._itemsAboveRenderBlock + this._itemsInRenderBlock; i++) {
                    if (this._isCellVisible(this.props.itemList[i].key)) {
                        foundVisibleItemBefore = true;
                        break;
                    }

                    if (i === itemIndex) {
                        break;
                    }
                }

                if (!foundVisibleItemBefore) {
                    // It's in a safe block above the known-width render area.
                    if (this.props.logInfo) {
                        this.props.logInfo('Added delta to fake space offset: ' + (oldWidth - newWidth) + ' -> ' +
                            (this._widthLeftRenderAdjustment + (oldWidth - newWidth)));
                    }

                    this._widthLeftRenderAdjustment += (oldWidth - newWidth);
                }
            }

            needsRecalc = true;
        }

        this._pendingMeasurements.delete(itemKey);
        needsRecalc = needsRecalc || this._pendingMeasurements.size === 0;

        if (needsRecalc) {
            this._calcNewRenderedItemState(this.props);
            this._renderIfDirty(this.props);
        }

        // See if we have accumulated enough error to require an adjustment.
        this._reconcileCorrections(this.props);
    }

    private _onAnimateStartStopItem = (itemKey: string, animateStart: boolean) => {
        if (this._isMounted) {
            const hasAnimation = this._pendingAnimations.has(itemKey);
            if (animateStart) {
                assert(!hasAnimation, 'unexpected animation start');
                this._pendingAnimations.add(itemKey);
            } else {
                assert(hasAnimation, 'unexpected animation complete');
                this._pendingAnimations.delete(itemKey);

                // We defer this because there are cases where we can cancel animations
                // because we've received new props. We don't want to re-enter the
                // routines with the old props, so we'll defer and wait for this.props
                // to be updated.
                _.defer(() => {
                    if (this._isMounted) {
                        if (this._pendingAnimations.size === 0 && this._isMounted) {
                            // Perform deferred actions now that all animations are complete.
                            this._reconcileCorrections(this.props);
                        }
                    }
                });
            }
        }
    }
    scrollToTop = (animated = true, top = 0) => {
        const scrollView = this._scrollViewRef.current;
        if (scrollView) {
            scrollView.setScrollTop(top, animated);
        }
    }
    private _onScroll = (scrollTop: number, scrollLeft: number) => {
        /**if (this._lastScrollTop !== scrollTop) {
            this.scrollToTop(true, scrollTop);
            this._lastScrollTop = scrollTop;
        } */

        if (this._lastScrollLeft === scrollLeft) {
            // Already know about it!
            if (this.props.logInfo) {
                this.props.logInfo('Got Known Scroll: ' + scrollLeft);
            }
            return;
        }

        this._lastScrollLeft = scrollLeft;

        // We scrolled, so update item state.
        this._calcNewRenderedItemState(this.props);

        this._renderIfDirty(this.props);

        // See if we have accumulated enough error to require an adjustment.
        this._reconcileCorrections(this.props);

        if (this.props.onScroll) {
            this.props.onScroll(scrollTop, scrollLeft);
        }
    }

    // Some things to keep in mind during this function:
    // * Item widths are all in a fixed state from the beginning to the end of the function. The total
    //   container width will never change through the course of the function. We're only deciding what
    //   to bother rendering/culling and where to place items within the container.
    // * We're going to, in order: cull unnecessary items, add new items, and position them within the container.
    private _calcNewRenderedItemState(props: VirtualListViewProps<ItemInfo>): void {
        if (this._layoutWidth === 0) {
            // Wait until we get a width before bothering.
            return;
        }

        if (props.itemList.length === 0) {
            // Can't possibly be rendering anything.
            return;
        }

        if (this._pendingMeasurements.size > 0) {
            // Don't bother if we're still measuring things. Wait for the last batch to end.
            return;
        }

        // What's the top/bottom line that we'll cull items that are wholly outside of?
        const cullMargin = Math.max(this._layoutWidth * this._cullFraction, this._minCullAmount);
        const leftCullLine = this._lastScrollLeft - cullMargin;
        const rightCullLine = this._lastScrollLeft + this._layoutWidth + cullMargin;

        // Do we need to cut anything out of the top because we've scrolled away from it?
        while (this._itemsInRenderBlock > 0) {
            const itemIndex = this._itemsAboveRenderBlock;
            const item = props.itemList[itemIndex];
            if (!this._isItemWidthKnown(item)) {
                break;
            }

            const itemWidth = this._getWidthOfItem(item);
            if (this._widthLeftRenderAdjustment + this._widthLeftRenderBlock + itemWidth >= leftCullLine) {
                // We're rendering up to the top render line, so don't need to nuke any more.
                break;
            }

            this._itemsInRenderBlock--;
            this._widthOfRenderBlock -= itemWidth;
            this._itemsAboveRenderBlock++;
            this._widthLeftRenderBlock += itemWidth;
            this._recycleCell(item.key);

            if (props.logInfo) {
                props.logInfo('Culled Item From Top: ' + item.key);
            }
        }

        // Do we need to cut anything out of the bottom because we've scrolled away from it?
        while (this._itemsInRenderBlock > 0) {
            const itemIndex = this._itemsAboveRenderBlock + this._itemsInRenderBlock - 1;
            const item = props.itemList[itemIndex];
            if (!this._isItemWidthKnown(item)) {
                break;
            }

            const itemWidth = this._getWidthOfItem(item);
            if (this._widthLeftRenderAdjustment + this._widthLeftRenderBlock + this._widthOfRenderBlock
                - itemWidth <= rightCullLine) {
                break;
            }

            this._itemsInRenderBlock--;
            this._widthOfRenderBlock -= itemWidth;
            this._itemsBelowRenderBlock++;
            this._widthRightRenderBlock += itemWidth;
            this._recycleCell(item.key);

            if (props.logInfo) {
                props.logInfo('Culled Item From Bottom: ' + item.key);
            }
        }

        // Determine what the line is that we're rendering up to. If we haven't yet filled a screen,
        // first get the screen full before over-rendering.
        const overdrawAmount = this._calcOverdrawAmount();
        let renderMargin = this._isInitialFillComplete ? overdrawAmount : 0;
        let renderBlockLeftLimit = this._lastScrollLeft - renderMargin;
        let renderBlockRightLimit = this._lastScrollLeft + this._layoutWidth + renderMargin;

        if (this._itemsInRenderBlock === 0) {
            let xPosition = this._widthLeftRenderAdjustment;
            this._itemsAboveRenderBlock = 0;

            // Find the first item that's in the render block and add it.
            for (let i = 0; i < props.itemList.length; i++) {
                const item = props.itemList[i];
                const itemWidth = this._getWidthOfItem(item);

                xPosition += itemWidth;

                if (xPosition > renderBlockLeftLimit) {
                    this._itemsAboveRenderBlock = i;
                    this._itemsInRenderBlock = 1;

                    this._allocateCell(item.key, item.template, i, !item.measureWidth, item.width, item.height,
                        xPosition - itemWidth, this._shouldShowItem(item, props));

                    if (!this._isItemWidthKnown(item)) {
                        this._pendingMeasurements.add(item.key);
                    }
                    break;
                }
            }

            this._itemsBelowRenderBlock = props.itemList.length - this._itemsAboveRenderBlock - this._itemsInRenderBlock;
            this._widthLeftRenderBlock = this._calcWidthOfItems(props, 0, this._itemsAboveRenderBlock - 1);
            this._widthOfRenderBlock = this._calcWidthOfItems(props, this._itemsAboveRenderBlock,
                this._itemsAboveRenderBlock + this._itemsInRenderBlock - 1);
            this._widthRightRenderBlock = this._calcWidthOfItems(props,
                this._itemsAboveRenderBlock + this._itemsInRenderBlock, props.itemList.length - 1);
        }

        // What is the whole width of the scroll region? We need this both for calculating bottom
        // offsets as well as for making the view render to the proper width since we're using
        // position: absolute for all placements.
        const itemBlockWidth = this._widthLeftRenderAdjustment + this._widthLeftRenderBlock +
            this._widthOfRenderBlock + this._widthRightRenderBlock;
        const containerWidth = Math.max(itemBlockWidth, this._layoutWidth);

        // Render the actual items now!
        let xPosition = this._widthLeftRenderBlock + this._widthLeftRenderAdjustment;

        let leftOfRenderBlockX = xPosition;

        // Start by checking widths/visibility of everything in the render block before we add to it.
        for (let i = 0; i < this._itemsInRenderBlock; i++) {
            const itemIndex = this._itemsAboveRenderBlock + i;
            const item = props.itemList[itemIndex];

            this._setCellLeftAndVisibility(item.key, this._shouldShowItem(item, props),
                xPosition, !!this.props.animateChanges);

            const width = this._getWidthOfItem(item);
            xPosition += width;
        }

        let rightOfRenderBlockX = xPosition;

        // See if the container width needs adjusting.
        if (containerWidth !== this._containerWidth) {
            if (props.logInfo) {
                props.logInfo('Container width Change: ' + this._containerWidth + ' to ' + containerWidth);
            }
            this._containerWidth = containerWidth;
            this._containerWidthValue.setValue(containerWidth);
        }

        // Reuse an item-builder.
        const buildItem = (itemIndex: number, above: boolean) => {
            const item = props.itemList[itemIndex];
            const isWidthKnown = this._isItemWidthKnown(item);
            const itemWidth = this._getWidthOfItem(item);
            assert(itemWidth > 0, 'list items should always have non-zero width');

            this._itemsInRenderBlock++;
            this._widthOfRenderBlock += itemWidth;
            let xPlacement: number;
            if (above) {
                this._itemsAboveRenderBlock--;
                this._widthLeftRenderBlock -= itemWidth;
                leftOfRenderBlockX -= itemWidth;
                xPlacement = leftOfRenderBlockX;
            } else {
                this._itemsBelowRenderBlock--;
                this._widthRightRenderBlock -= itemWidth;
                xPlacement = rightOfRenderBlockX;
                rightOfRenderBlockX += itemWidth;
            }

            if (!isWidthKnown) {
                this._pendingMeasurements.add(item.key);
            }

            this._allocateCell(item.key, item.template, itemIndex, !item.measureWidth, item.width, item.height,
                xPlacement, this._shouldShowItem(item, props));

            if (props.logInfo) {
                props.logInfo('New Item On ' + (above ? 'Top' : 'Bottom') + ': ' + item.key);
            }
        };

        // Try to add items to the bottom of the current render block.
        while (this._pendingMeasurements.size < _maxSimultaneousMeasures) {
            // Stop if we go beyond the bottom render limit.
            if (this._itemsBelowRenderBlock <= 0 ||
                this._widthLeftRenderAdjustment + this._widthLeftRenderBlock +
                this._widthOfRenderBlock >= renderBlockRightLimit) {
                break;
            }

            buildItem(this._itemsAboveRenderBlock + this._itemsInRenderBlock, false);
        }

        // Try to add an item to the top of the current render block.
        while (this._pendingMeasurements.size < _maxSimultaneousMeasures) {
            if (this._itemsAboveRenderBlock <= 0 ||
                this._widthLeftRenderAdjustment + this._widthLeftRenderBlock <= renderBlockLeftLimit) {
                break;
            }

            buildItem(this._itemsAboveRenderBlock - 1, true);
        }

        // See if we've filled the screen and rendered it, and we're not waiting on any measurements.
        if (!this._isInitialFillComplete && !this._isRenderDirty && this._pendingMeasurements.size === 0) {
            // Time for overrender. Recalc render lines.
            renderMargin = overdrawAmount;
            renderBlockLeftLimit = this._lastScrollLeft - renderMargin;
            renderBlockRightLimit = this._lastScrollLeft + this._layoutWidth + renderMargin;

            this._popInvisibleIntoView(props);

            // Render pass again!
            this._componentDidRender();
        }

        if (props.logInfo) {
            props.logInfo('CalcNewRenderedItemState: O:' + this._widthLeftRenderAdjustment +
                ' + A:' + this._widthLeftRenderBlock + ' + R:' + this._widthOfRenderBlock + ' + B:' +
                    this._widthRightRenderBlock + ' = ' + itemBlockWidth + ', FilledViewable: ' + this._isInitialFillComplete);
        }
    }

    private _reconcileCorrections(props: VirtualListViewProps<ItemInfo>) {
        // If there are pending animations, don't adjust because it will disrupt
        // the animations. When all animations are complete, we will get called back.
        if (this._pendingAnimations.size > 0) {
            return;
        }

        // Calculate the max amount of error we want to accumulate before we adjust
        // the content width size. We don't want to do this too often because it's
        // expensive, but we also don't want to let the error get too great because
        // the scroll bar thumb will not accurately reflect the scroll position.
        let maxFakeSpaceOffset = 0; //Math.max(this._layoutWidth / 2, 256);

        // If the user has scrolled all the way to the boundary of the rendered area,
        // we can't afford any error.
        if (this._lastScrollLeft === 0 || this._lastScrollLeft < this._widthLeftRenderAdjustment) {
            maxFakeSpaceOffset = 0;
        }

        // Did the error amount exceed our limit?
        if (Math.abs(this._widthLeftRenderAdjustment) > maxFakeSpaceOffset) {
            if (props.logInfo) {
                props.logInfo('Removing _widthLeftRenderAdjustment');
            }

            // We need to adjust the content width, the positions of the rendered items
            // and the scroll position as atomically as possible.
            const newContainerWidth = this._containerWidth - this._widthLeftRenderAdjustment;
            if (props.logInfo) {
                props.logInfo('Container width Change: ' + this._containerWidth + ' to ' + newContainerWidth);
            }
            this._containerWidth = newContainerWidth;
            this._containerWidthValue.setValue(newContainerWidth);

            for (let i = this._itemsAboveRenderBlock; i < this._itemsAboveRenderBlock + this._itemsInRenderBlock; i++) {
                const item = props.itemList[i];
                const cell = this._activeCells.get(item.key)!;
                this._setCellLeftAndVisibility(item.key, cell.isVisible,
                    cell.left - this._widthLeftRenderAdjustment, false);
            }

            // Clear the adjustment.
            this._widthLeftRenderAdjustment = 0;
        }
    }

    private _popInvisibleIntoView(props: VirtualListViewProps<ItemInfo>) {
        if (props.logInfo) {
            props.logInfo('Popping invisible items into view');
        }

        this._isInitialFillComplete = true;

        // Update styles now to snap everything into view.
        for (let i = 0; i < this._itemsInRenderBlock; i++) {
            const itemIndex = this._itemsAboveRenderBlock + i;
            const item = props.itemList[itemIndex];
            const cellInfo = this._activeCells.get(item.key)!;
            this._setCellLeftAndVisibility(item.key, this._shouldShowItem(item, props),
                cellInfo.left, false);
        }
    }

    private _resizeAllItems(props: VirtualListViewProps<ItemInfo>) {
        if (this._layoutHeight > 0 && this._layoutHeight !== this._contentHeight) {
            this._contentHeight = this._layoutHeight;
            this.forceUpdate();
        }
    }

    private _renderIfDirty(props: VirtualListViewProps<ItemInfo>): void {
        if (this._isRenderDirty) {
            if (this._isMounted) {
                this.forceUpdate();
            }
        }
    }

    // Cell Management Methods

    private _allocateCell(itemKey: string, itemTemplate: string | undefined, itemIndex: number, isWidthConstant: boolean,
        width: number, height: number, left: number, isVisible: boolean): VirtualCellInfo<ItemInfo> {
        let newCell = this._activeCells.get(itemKey);

        if (!newCell) {
            // If there's a specified template, see if we can find an existing
            // recycled cell that we can reuse with the same template.
            if (itemTemplate && isWidthConstant) {
                // See if we can find an exact match both in terms of template and previous key.
                // This has the greatest chance of rendering the same as previously.
                let bestOptionIndex = _.findIndex(this._recycledCells, cell => cell.itemTemplate === itemTemplate &&
                    cell.cachedItemKey === itemKey && cell.width === width);

                // We couldn't find an exact match. Try to find one with the same template.
                if (bestOptionIndex < 0) {
                    bestOptionIndex = _.findIndex(this._recycledCells, cell => cell.itemTemplate === itemTemplate);
                }

                if (bestOptionIndex >= 0) {
                    newCell = this._recycledCells[bestOptionIndex];
                    this._recycledCells.splice(bestOptionIndex, 1);
                }
            }
        }

        if (newCell) {
            // We found an existing cell. Repurpose it.
            newCell.isVisible = isVisible;
            newCell.left = left;
            newCell.shouldUpdate = true;

            assert(newCell.isWidthConstant === isWidthConstant, 'isWidthConstant assumed to not change');
            assert(newCell.itemTemplate === itemTemplate, 'itemTemplate assumed to not change');

            const mountedCell = newCell.cellRef.current;
            if (mountedCell) {
                mountedCell.setVisibility(isVisible);
                mountedCell.setLeft(left);
                mountedCell.setItemKey(itemKey);
            }
        } else {
            // We didn't find a recycled cell that we could use. Allocate a new one.
            newCell = {
                cellRef: createRef<VirtualListCell<ItemInfo>>(),
                virtualKey: _virtualKeyPrefix + VirtualListViewHorizontal._nextCellKey,
                itemTemplate: itemTemplate,
                isWidthConstant: isWidthConstant,
                width: width,
                height: height,
                cachedItemKey: itemKey,
                left: left,
                isVisible: isVisible,
                shouldUpdate: true
            };
            VirtualListViewHorizontal._nextCellKey += 1;
        }

        this._isRenderDirty = true;
        this._activeCells.set(itemKey, newCell);
        return newCell;
    }

    private _recycleCell(itemKey: string) {
        const virtualCellInfo = this._activeCells.get(itemKey);

        if (virtualCellInfo) {
            if (this._maxRecycledCells > 0) {
                this._setCellLeftAndVisibility(itemKey, false, virtualCellInfo.left, false);

                // Is there a "template" hint associated with this cell? If so,
                // we may be able to reuse it later.
                if (virtualCellInfo.itemTemplate && virtualCellInfo.isWidthConstant) {
                    this._recycledCells.push(virtualCellInfo);

                    if (this._recycledCells.length > this._maxRecycledCells) {
                        // Delete the oldest recycled cell.
                        this._recycledCells.splice(0, 1);
                        this._isRenderDirty = true;
                    }
                } else {
                    // Re-render to force the cell to be unmounted.
                    this._isRenderDirty = true;
                }
            }

            this._activeCells.delete(itemKey);
        }
    }

    private _setCellLeftAndVisibility(itemKey: string, isVisibile: boolean, left: number,
        animateIfPreviouslyVisible: boolean) {

        const cellInfo = this._activeCells.get(itemKey);
        if (!cellInfo) {
            assert(false, 'Missing cell');
            return;
        }

        // Disable animation for Android when screen reader is on.
        // This is needed to make sure screen reader order is correct.
        const animate = animateIfPreviouslyVisible && cellInfo.isVisible && !this._isAndroidScreenReaderEnabled();

        cellInfo.isVisible = isVisibile;
        cellInfo.left = left;

        // Set the "live" values as well.
        const cell = cellInfo.cellRef.current;
        if (cell) {
            cell.setVisibility(isVisibile);
            cell.setLeft(left, animate);
        }
    }

    private _isCellVisible(itemKey: string): boolean {
        const cellInfo = this._activeCells.get(itemKey);
        return (!!cellInfo && cellInfo.isVisible);
    }

    scrollToLeft = (animated = true, left = 0) => {
        const scrollView = this._scrollViewRef.current;
        if (scrollView) {
            scrollView.setScrollLeft(left, animated);
        }
    }

    render() {
        const itemsRendered: JSX.Element[] = [];
        this._navigatableItemsRendered = [];

        if (this.props.logInfo) {
            this.props.logInfo('Rendering ' + this._itemsInRenderBlock + ' Items...');
        }

        // Build a list of all the cells we're going to render. This includes all of the active
        // cells plus any recycled (offscreen) cells.
        let cellList: {
            cellInfo: VirtualCellInfo<ItemInfo>;
            item: ItemInfo | undefined;
            itemIndex: number | undefined;
        }[] = [];

        for (let i = 0; i < this._itemsInRenderBlock; i++) {
            const itemIndex = this._itemsAboveRenderBlock + i;
            const item = this.props.itemList[itemIndex];

            const virtualCellInfo = this._activeCells.get(item.key)!;
            assert(virtualCellInfo, 'Active Cell not found for key ' + item.key + ', index=' + i);

            cellList.push({
                cellInfo: virtualCellInfo,
                item: item,
                itemIndex: itemIndex
            });

            if (item.isNavigable) {
                this._navigatableItemsRendered.push({ key: item.key, vc_key: virtualCellInfo.virtualKey });
            }
        }

        for (const virtualCellInfo of this._recycledCells) {
            assert(virtualCellInfo, 'Recycled Cells array contains a null/undefined object');
            cellList.push({
                cellInfo: virtualCellInfo,
                item: undefined,
                itemIndex: undefined
            });
        }

        // Sort the list of cells by virtual key so the order doesn't change. Otherwise
        // the underlying render engine (the browser or React Native) treat it as a DOM
        // change, and perf suffers.
        cellList = cellList.sort((a, b) => a.cellInfo.virtualKey < b.cellInfo.virtualKey ? 1 : -1);

        let focusIndex: number | undefined;
        if (this.state.lastFocusedItemKey === undefined) {
            const itemToFocus = _.minBy(cellList, cell => {
                if (!cell.item || !cell.item.isNavigable) {
                    return Number.MAX_VALUE;
                }
                return cell.itemIndex;
            });

            if (itemToFocus) {
                focusIndex = itemToFocus.itemIndex;
            }
        }
        let itemHeight = 0;
        for (const cell of cellList) {
            let tabIndexValue = -1;
            let isFocused = false;
            let isSelected = false;
            if (cell.item) {
                itemHeight = cell.item.height;
                if (cell.item.isNavigable) {
                    if (cell.itemIndex === focusIndex) {
                        tabIndexValue = 0;
                    } else {
                        tabIndexValue = cell.item.key === this.state.lastFocusedItemKey ? 0 : -1;
                    }

                    if (cell.item.key === this.state.selectedItemKey) {
                        isSelected = true;
                    }
                }

                if (cell.item.key === this.state.lastFocusedItemKey) {
                    isFocused = true;
                }
            }

            // We disable transform in Android because it creates problem for screen reader order.
            // We update the keys in order to make sure we re-render cells, as once we enable native animation for a view.
            // We can't disable it.
            itemsRendered.push(
                <VirtualListCell
                    ref={ cell.cellInfo.cellRef }
                    key={ this._isAndroidScreenReaderEnabled() ? _accessibilityVirtualKeyPrefix +
                        cell.cellInfo.virtualKey : cell.cellInfo.virtualKey }
                    onLayout={ !cell.cellInfo.isWidthConstant ? this._onLayoutItem : undefined }
                    onAnimateStartStop={ this._onAnimateStartStopItem }
                    itemKey={ cell.item ? cell.item.key : undefined }
                    item={ cell.item }
                    top={ 0 }
                    height={ this._contentHeight }
                    left={ cell.cellInfo.left }
                    isVisible={ cell.cellInfo.isVisible }
                    isActive={ cell.item ? true : false }
                    isFocused={ isFocused }
                    isSelected={ isSelected }
                    tabIndex={ tabIndexValue }
                    onItemFocused={ this._onItemFocused }
                    onItemSelected={ this._onItemSelected }
                    shouldUpdate={ !this.props.skipRenderIfItemUnchanged || cell.cellInfo.shouldUpdate }
                    showOverflow={ this.props.showOverflow }
                    isScreenReaderModeEnabled={ this._isAndroidScreenReaderEnabled() }
                    renderItem={ this.props.renderItem }
                    onKeyPress={ this._onKeyDown }
                />
            );

            cell.cellInfo.shouldUpdate = false;
        }
        if (itemHeight != this._itemHeight) {
            this._lastItemHeight = this._itemHeight;
            this._itemHeight = itemHeight;

        }
        if (this.props.logInfo) {
            // [NOTE: For debugging] This shows the order in which virtual cells are laid out.
            const domOrder = _.map(cellList, c => {
                const itemKey = c.item ? c.item.key : null;
                const itemIndex = c.item ? c.itemIndex : null;
                return 'vKey: ' + c.cellInfo.virtualKey + ' iKey: ' + itemKey + ' iIdx: ' + itemIndex;
            }).join('\n');
            this.props.logInfo(domOrder);
            this.props.logInfo('Item Render Complete');
        }

        const scrollViewStyle = [_styles.scrollContainer];
        let staticContainerStyle: (RX.Types.ViewStyleRuleSet | RX.Types.AnimatedViewStyleRuleSet)[] = [_styles.staticContainer, {height: this._itemHeight}];
        if (this.props.style) {
            if (Array.isArray(this.props.style)) {
                staticContainerStyle = staticContainerStyle.concat(this.props.style as RX.Types.ViewStyleRuleSet[]);
            } else {
                staticContainerStyle.push(this.props.style);
            }
        }

        staticContainerStyle.push(this._containerAnimatedStyle);
        ScrollViewConfig.setUseCustomScrollbars(true);
        return (
            <RX.ScrollView
                ref={ this._scrollViewRef }
                testId={ this.props.testId }
                onLayout={ this._onLayoutContainer }
                onScroll={ this._onScroll }
                scrollXAnimatedValue={ this.props.scrollXAnimatedValue }
                scrollYAnimatedValue={ this.props.scrollYAnimatedValue }
                keyboardDismissMode={ this.props.keyboardDismissMode }
                keyboardShouldPersistTaps={ this.props.keyboardShouldPersistTaps }
                scrollsToTop={ this.props.scrollsToTop }
                scrollEventThrottle={ this.props.scrollEventThrottle || 32 } // 32ms throttle -> ~30 events per second max
                style={ scrollViewStyle }
                horizontal={ true }
                vertical={ true }
                bounces={ !this.props.disableBouncing }
                onKeyPress={ this._onKeyDown }
                scrollEnabled={ !this.props.disableScrolling }
                scrollIndicatorInsets={ this.props.scrollIndicatorInsets }
            >
                <RX.Animated.View style={ staticContainerStyle }>
                    { itemsRendered }
                </RX.Animated.View>
            </RX.ScrollView>
        );
    }

    private _onItemFocused = (itemInfo?: ItemInfo) => {
        if (itemInfo) {
            this.setState({
                lastFocusedItemKey: itemInfo.key,
                isFocused: true
            });
        } else {
            this.setState({ isFocused: false });
        }

        if (this.props.onItemFocused) {
            this.props.onItemFocused(itemInfo);
        }
    }

    // Sets selection & focus to specified key
    selectItemKey(key: string, scrollToItem = true) {
        // Set focus and selection
        this.setState({
            lastFocusedItemKey: key,
            selectedItemKey: key
        });
        if (scrollToItem) {
            this._scrollToItemKey(key);
        }
    }

    private _onItemSelected = (itemInfo?: ItemInfo) => {
        if (itemInfo) {
            this.selectItemKey(itemInfo.key, false);
            if (this.props.onItemSelected) {
                this.props.onItemSelected(itemInfo);
            }
        }
    }

    private _onKeyDown = (e: RX.Types.KeyboardEvent) => {
        if (!this._scrollViewRef.current ||
                (e.keyCode !== _keyCodeUpArrow && e.keyCode !== _keyCodeDownArrow)) {
            return;
        }

        // Is it an "up arrow" key?
        if (e.keyCode === _keyCodeUpArrow) {
            this._focusSubsequentItem(FocusDirection.Up, true);
            e.preventDefault();
        // Is it a "down arrow" key?
        } else if (e.keyCode === _keyCodeDownArrow) {
            this._focusSubsequentItem(FocusDirection.Down, true);
            e.preventDefault();
        }
    }

    private _scrollToItemKey(key: string): void {
        let indexToSelect: number | undefined;
        _.each(this.props.itemList, (item, idx) => {
            if (item.key === key) {
                indexToSelect = idx;
                return true;
            }
        });

        if (indexToSelect !== undefined) {
            this._scrollToItemIndex(indexToSelect);
        }
    }

    private _scrollToItemIndex(index: number): void {
        this.scrollToLeft(false, this._calcWidthOfItems(this.props, 0, index - 1) - (this.props.keyboardFocusScrollOffset || 0));
    }

    // Returns true if successfully found/focused, false if not found/focused
    private _focusSubsequentItem(direction: FocusDirection, viaKeyboard: boolean, retry = true): boolean {
        let index: number | undefined = _.findIndex(this._navigatableItemsRendered, item => item.key === this.state.lastFocusedItemKey);

        if (index !== -1 && index + direction > -1 && index + direction < this._navigatableItemsRendered.length) {
            const newFocusKey = this._navigatableItemsRendered[index + direction].key;
            const cellForFocus = this._activeCells.get(newFocusKey);
            if (cellForFocus && cellForFocus.cellRef.current) {
                const newElementForFocus = cellForFocus.cellRef.current;
                newElementForFocus.focus();
                if (viaKeyboard && newElementForFocus.props.itemKey) {
                    this._scrollToItemKey(newElementForFocus.props.itemKey);
                }
            }
            return true;
        }

        if (index === -1 && retry && this.state.lastFocusedItemKey !== undefined) {
            index = this._itemMap.get(this.state.lastFocusedItemKey);

            if (index === undefined) {
                assert(false, 'Something went wrong in finding last focused item');
                return false;
            }

            const width = index === 0 ? 0 : this._calcWidthOfItems(this.props, 0, index - 1);
            this.scrollToLeft(false, width);
            this._pendingFocusDirection = direction;
            return true;
        }
        return false;
    }

    private _screenReaderStateChanged = (isEnabled: boolean) => {
        if (isEnabled) {
            this._setupForAccessibility();

            if (_isNativeAndroid) {
                // We need to re-render virtual cells.
                this._isRenderDirty = true;
            }

            this._renderIfDirty(this.props);
        } else {
            this._tearDownForAccessibility();
        }
    }

    componentDidMount() {
        RX.Accessibility.screenReaderChangedEvent.subscribe(this._screenReaderStateChanged);

        if (RX.Accessibility.isScreenReaderEnabled()) {
            this._setupForAccessibility();
        }

        this._isMounted = true;
        this._componentDidRender();

        // If an initial selection key was provided, ensure that we scroll to the item
        if (this.props.initialSelectedKey) {
            this._scrollToItemKey(this.props.initialSelectedKey);
        }
    }

    componentWillUnmount() {
        this._isMounted = false;

        RX.Accessibility.screenReaderChangedEvent.unsubscribe(this._screenReaderStateChanged);
    }

    componentDidUpdate(prevProps: VirtualListViewProps<ItemInfo>) {
        this._componentDidRender();
    }

    protected _componentDidRender() {
        if (this.props.logInfo) {
            this.props.logInfo('Component Did Render');
        }

        this._isRenderDirty = false;

        // If we don't defer this, we can end up overflowing the stack
        // because one render immediately causes another render to be started.
        _.defer(() => {
            if (this._isMounted) {
                this._calcNewRenderedItemState(this.props);
                this._renderIfDirty(this.props);
                this._reconcileCorrections(this.props);
                this._setFocusIfNeeded();
            }
        });
    }

    // If there was a pending focus setting before we re-rendered, set the same.
    private _setFocusIfNeeded() {
        if (this._pendingFocusDirection) {
            this._focusSubsequentItem(this._pendingFocusDirection, false, false /* do not retry if this fails */);
            this._pendingFocusDirection = undefined;
        }
    }

    // Local helper functions for item information
    private _shouldShowItem(item: VirtualListViewItemInfo, props: VirtualListViewProps<ItemInfo>): boolean {
        const isMeasuring = !this._isItemWidthKnown(item);
        const shouldHide = isMeasuring || !this._isInitialFillComplete;
        return !shouldHide;
    }

    private _calcWidthOfItems(props: VirtualListViewProps<ItemInfo>, startIndex: number, endIndex: number) {
        let count = 0;
        for (let i = startIndex; i <= endIndex; i++) {
            count += this._getWidthOfItem(props.itemList[i]);
        }
        return count;
    }

    private _isItemWidthKnown(item: VirtualListViewItemInfo) {
        return !item.measureWidth || this._widthCache.has(item.key);
    }

    private _getWidthOfItem(item: VirtualListViewItemInfo | undefined) {
        if (!item) {
            return 0;
        }

        // See if the item width was passed as "known"
        if (!item.measureWidth) {
            return item.width;
        }

        // See if we have it cached
        const cachedWidth = this._widthCache.get(item.key);
        if (cachedWidth !== undefined) {
            return cachedWidth;
        }

        // Nope -- use guess given to us
        return item.width;
    }
}
