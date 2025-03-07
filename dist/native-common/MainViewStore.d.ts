/**
 * MainViewStore.tsx
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * A simple store that publishes changes to the main element
 * provided by the app.
 */
import * as React from 'react';
import SubscribableEvent from 'subscribableevent';
export declare class MainViewStore extends SubscribableEvent<() => void> {
    private _mainView;
    getMainView(): React.ReactElement<any, string | ((props: any) => React.ReactElement<any, string | any | (new (props: any) => React.Component<any, any, any>)> | null) | (new (props: any) => React.Component<any, any, any>)> | undefined;
    setMainView(view: React.ReactElement<any>): void;
}
declare const _default: MainViewStore;
export default _default;
