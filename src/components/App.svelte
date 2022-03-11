<!--
Copyright 2021-2022 New Vector Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<script lang="ts">
    import router from "page";
    import { ClientManager } from "../ClientManager";
    import Oops from "./Oops.svelte";
    import Settings from "./Settings.svelte";
    import SharedWithMe from "./SharedWithMe.svelte";
    import Login from "./auth/Login.svelte";
    import Reconnect from "./auth/Reconnect.svelte";
    import type { SvelteComponent } from "svelte";
    import Drawer, { AppContent, Content } from '@smui/drawer';
    import SideBar from "./SideBar.svelte";
    import MenuSurface, { MenuSurfaceComponentDev } from '@smui/menu-surface';
    import List, { Item, Graphic, Separator, Text } from '@smui/list';
    import Button, { Label, Icon } from '@smui/button';
    import Browser from "./Browser.svelte";
    import TextfieldDialog from "./TextfieldDialog.svelte";
    import { errorWrapper, setMenuPositions, sortEntries, workspaceNameValidator } from "../utils";
    import { ToastContainer, FlatToast }  from "svelte-toasts";
    import Textfield from "@smui/textfield";
    import type { IFolderEntry, TreeSpaceEntry } from "matrix-files-sdk";
    import Register from "./auth/Register.svelte";
    import IconButton from "@smui/icon-button";
    import dayjs from "dayjs";
    import 'dayjs/locale/en';
    import localizedFormat from 'dayjs/plugin/localizedFormat';
    import { getLogger } from "log4js";

    const log = getLogger('App');

    dayjs.extend(localizedFormat);
    dayjs.locale('en');

    let page: typeof SvelteComponent | undefined;
    let search = '';
    let isLoggedIn = false;

    let addMenu: MenuSurfaceComponentDev;

    async function newClicked(e: CustomEvent) {
        if (!directoryId) {
            newWorkspace();
        } else {
            addMenu.setOpen(true);
            setMenuPositions(e as unknown as PointerEvent);
        }
    }

    const clientManager = new ClientManager();

    clientManager.authedState.onUpdate(authed => {
        isLoggedIn = authed;
        if (authed) {
            loadWorkspaces();
            clientManager.on('modified', loadWorkspaces);
        } else {
            router.redirect('/');
        }
    });

    async function redirectIfAuthed(otherwise: () => any) {
        if (isLoggedIn) {
            router.redirect('/home');
        } else if (clientManager.hasAuthData && router.current !== '/reconnect') {
            if (!clientManager.nextRoute) {
                clientManager.nextRoute = router.current;
            }
            router.replace('/reconnect');
        } else {
            otherwise();
        }
    }

    type ThenRoute = (ctx: PageJS.Context) => string;
    function requiresAuth(then: string | ThenRoute, and?: PageJS.Callback): PageJS.Callback {
        return (realCtx: PageJS.Context, realNext: () => void) => {
            if (!isLoggedIn) {
                router.redirect('/'); // will route to login page if needed
                clientManager.nextRoute = typeof then === 'function' ? then(realCtx) : then;
                realNext();
            } else {
                if (and) {
                    and(realCtx, realNext);
                } else {
                    realNext();
                }
            }
        };
    }

    let directoryId: string | undefined = undefined;
    function listing(ctx: undefined | { directoryId?: string }) {
        directoryId = ctx?.directoryId;
        page = undefined;
    }

    async function newWorkspace() {
        const name = await textfieldDialog.open('New workspace', 'Untitled workspace', 'Workspace name', 'Create', workspaceNameValidator(undefined, workspaces));
        if (name) {
            await errorWrapper(async () => {
                await clientManager.files.addFolder(name);
            }, `Failed to create workspace ${name}`);
        }
    }


    let workspaces: IFolderEntry[] = [];

    async function loadWorkspaces() {
        log.info('loadWorkspaces()');
        workspaces = sortEntries(await clientManager.files.getChildren()) as IFolderEntry[];
        workspaces.forEach(x => log.info((x as TreeSpaceEntry).treespace.room.getMyMembership()));
    }

    router ('*', ({ path, querystring, hash }, next) => {
        log.info(`GET ${path}${hash ? `#${hash}` : ''}${querystring ? `?${querystring}`: ''}`);
        next();
    });

    router('/', async () => {
        await redirectIfAuthed(() => router.redirect('/signin'));
    });
    router('/signin', async (_ctx, next) => {
        await redirectIfAuthed(() => next());
    }, () => page = Login);
    router('/register', async (_ctx, next) => {
        await redirectIfAuthed(() => next());
    }, () => page = Register);
    router('/reconnect', async (_ctx, next) => {
        await redirectIfAuthed(() => next());
    }, () => page = Reconnect);
    router('/shared', requiresAuth('/shared'), () => page = SharedWithMe);
    router('/settings', requiresAuth('/settings'), () => page = Settings);
    router('/home', requiresAuth('/home'), () => listing(undefined));
    router('/directory/:directoryId', requiresAuth(ctx => `/directory/${ctx.params.directoryId}`), ctx => listing(ctx.params));

    router('/*', () => page = Oops);

    router.base('#!');
    router({ hashbang: true });
    router.start();

    let browser: Browser;
    let textfieldDialog: TextfieldDialog;

    function newFolder() {
        addMenu.setOpen(false);
        browser.newFolder();
    }

    function newFile() {
        addMenu.setOpen(false);
        browser.newFile();
    }

    function fileUpload() {
        addMenu.setOpen(false);
        browser.fileUpload();
    }

    async function logout() {
        clientManager.nextRoute = undefined;
        search = '';
        await clientManager.logout()
        router.redirect('/signin');
    }
</script>


<ToastContainer
    placement="top-right"
    theme="light"
    duration={0}
    let:data={data}
>
    <FlatToast data={data} />
</ToastContainer>

<div class="app">
    <div class="drawer-container">
        <Drawer>
            <Content class="drawer-content">
                <img src="logo.svg" alt="Files SDK Demo" style="margin-bottom: 20px; width: 206px;"/>
                {#if isLoggedIn}
                    <Button on:click={e => newClicked(e)} style="left: 6px; border-radius: 21px; min-width: 108px; margin-bottom: 16px;" variant="unelevated">
                        <Icon class="material-icons-round">add</Icon>
                        <Label>New</Label>
                    </Button>

                    <MenuSurface bind:this={addMenu} quickOpen anchor={false}>
                        <List>
                            <Item on:SMUI:action={() => newFolder()}>
                                <Graphic class="material-icons-round">create_new_folder</Graphic>
                                <Text>New folder</Text>
                            </Item>
                            <Separator />
                            <Item on:SMUI:action={() => newFile()}>
                                <Graphic class="material-icons-round">insert_drive_file</Graphic>
                                <Text>New File</Text>
                            </Item>
                            <Item on:SMUI:action={() => fileUpload()}>
                                <Graphic class="material-icons-round">upload_file</Graphic>
                                <Text>File upload</Text>
                            </Item>
                            <!-- <Item on:SMUI:action={() => uploadFolder()}>
                                <Graphic class="material-icons-round">drive_folder_upload</Graphic>
                                <Text>Folder upload</Text>
                            </Item> -->
                        </List>
                    </MenuSurface>
                    
                    <SideBar {clientManager} />
                    <p style="text-align: center; font-size: 0.9em;">Signed in as @{clientManager.client.getUserIdLocalpart()}</p>
                    <div style="text-align: center">
                        <Button on:click={() => logout()}>
                            <Label>Sign out</Label>
                        </Button>    
                    </div>
                {/if}
            </Content>
        </Drawer>
        <AppContent class="app-content">
            {#if isLoggedIn}
                <div class="search-bar">
                    <Textfield
                        bind:value={search}
                        label="Search Files"
                        style="width: 100%;"
                        noLabel
                    >
                        <Icon class="material-icons-round" slot="leadingIcon">search</Icon>
                    </Textfield>
                    <IconButton on:click:preventDefault={() => router.show('/settings')} href="#"><Icon class="material-icons-round">settings</Icon></IconButton>
                </div>
            {/if}
            {#if page}
                <svelte:component this={page} {clientManager} />
            {:else if isLoggedIn}
                <Browser bind:this={browser} {clientManager} {workspaces} {directoryId} />
            {/if}
        </AppContent>
    </div>
</div>

<TextfieldDialog bind:this={textfieldDialog} />

<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/svelte-material-ui@4.0.0/bare.min.css" />

<style type="scss">
    @import '../Typography.scss';

    :global(body) {
        margin: 0;
        padding: 0;
    }

    :global(body:after) {
        content: "demo";
        position: fixed;
        width: 80px;
        height: 25px;
        background: #EE8E4A;
        top: 7px;
        left: -20px;
        text-align: center;
        font-size: 13px;
        font-weight: bold;
        color: #fff;
        line-height: 27px;
        transform:rotate(-45deg);
        z-index: 1000;
    }

    :global(input.solo-input) {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
        width: auto;
        margin-left: 1em;
    }

    .drawer-container {
        display: flex;
        width: 100%;
        height: 100%;
    }
    
    :global(.drawer-content) {
        width: 100%;
        height: 100%;
    }

    :global(.app-content) {
        width: 100%;
        height: 100%;
        margin: 4px !important;
        padding-left: 12px;
        padding-right: 12px;
    }

    :global(.cursor-pointer) {
        cursor: pointer;
    }

    :root {
        --mdc-typography-font-family: 'Inter';
        --mdc-theme-primary: #0DBD8B;
        --mdc-theme-secondary: #0DBD8B;
        --mdc-theme-background: #fff;
        --mdc-theme-surface: #fff;
        --mdc-theme-error: #FF5B55;
        --mdc-theme-on-primary: #fff;
        --mdc-theme-on-secondary: #fff;
        --mdc-theme-on-surface: #17191C;
        --mdc-theme-on-error: #fff;
        --mdc-shape-small: 8px;
        --mdc-typography-button-text-transform: none;
        --mdc-typography-button-font-weight: 600;
        --mdc-theme-text-primary-on-background: #17191C;
        --mdc-typography-body1-font-size: 15px;
        --mdc-typography-body2-font-size: 15px;
        --mdc-typography-subtitle1-font-size: 15px;
        --mdc-typography-subtitle2-font-size: 15px;
        --mdc-typography-button-font-size: 15px;
        --mdc-typography-body1-letter-spacing: default;
        --mdc-typography-body2-letter-spacing: default;
        --mdc-typography-subtitle1-letter-spacing: default;
        --mdc-typography-subtitle2-letter-spacing: default;
        --mdc-typography-button-letter-spacing: default;
    }

    :global(html, body) {
        height: 100%;
    }

    .app {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    :global(.solo-icon.material-icons) {
        width: 24px;
    }

    :global(.st-toast.light) {
        background: white !important;
    }

    .search-bar {
        width: 100%;
        margin-top: 8px;
        margin-bottom: 26px;
        margin-left: 14px;
        margin-right: 14px;
        display: flex;
        :global(.material-icons-round) {
            color: #8D97A5 !important;
        }

        :global(label) {
            align-items: center;
        }
    }

    :global(input[type=checkbox]) {
        filter: grayscale(1);
        border-left-color: #C1C6CD !important;
        border-right-color: #C1C6CD !important;
    }

    :global(aside) {
        width: 274px;
        padding-left: 24px;
        padding-right: 24px;
        padding-top: 34px;
        background: #FAFAFC !important;
    }
    :global(.smui-text-field--standard:not(.mdc-text-field--disabled) .mdc-line-ripple::before) {
        border-bottom-color: rgba(0,0,0,.12) !important;
    }

    :global(.mdc-menu-surface) {
        border-radius: 8px !important;
        box-shadow: 0px 1px 5px rgba(0, 0, 0, 0.25) !important;
    }

    :global(h3) {
        font-size: 24px;
        font-weight: 600;
    }
</style>
