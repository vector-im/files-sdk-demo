/*
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
*/

import { toasts } from 'svelte-toasts';
import type { IEntry, IFileEntry, IFolderEntry } from "matrix-files-sdk";

export function sortEntries(entries: IEntry[]): IEntry[] {
    return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export function fileIcon(filename: string): string {
    if (filename.match(/\.(png|jpg|jpeg|tiff|tif|gif)$/)) {
        return 'image';
    }

    if (filename.match(/\.(pdf)$/)) {
        return 'picture_as_pdf';
    }

    return 'article';
}

/**
 * 
 * @param block 
 * @param baseMessage 
 * @returns true if encryption error encountered
 */
export async function errorWrapper(block: () => Promise<any>, baseMessage: string): Promise<boolean> {
    let encryptionError = false;
    try {
        await block();
    } catch (err: any) {
        if (err.message.match(/Failed to find event/)) {
            encryptionError = true;
        }
        console.error(err);
        toasts.error(`${baseMessage}: ${err.message}`);
    }
    return encryptionError;
}

export function itemNameValidator(existingName: string | undefined, folders: IFolderEntry[], files: IFileEntry[]) {
    return (candidateName: string) => {
        const folder = nameValidator(existingName, folders.map(x => x.name), 'folder')(candidateName);
        if (folder !== true) {
            return folder;
        }

        return nameValidator(existingName, files.map(x => x.name), 'file')(candidateName);
    }
}

export function workspaceNameValidator(existingName: string | undefined, workspaces: IFolderEntry[]) {
    return nameValidator(existingName, workspaces.map(x => x.name), 'workspace');
}

export function nameValidator(existingName: string | undefined, otherExistingItems: string[], descriptionName: string) {
    return (candidateName: string) => {
        if (typeof existingName === 'string' && candidateName === existingName) {
            return true;
        }
        if (candidateName === '') {
            return 'You must enter a name';
        }
        const existing = otherExistingItems.find(x => x === candidateName);
        if (existing) {
            return `A ${descriptionName} called ${candidateName} already exists`;
        }
        return true;
    }
}

function _setMenuPositions(e: PointerEvent) {
    document.querySelectorAll(".mdc-menu-surface").forEach(x => x.setAttribute("style", `left: ${e.clientX}px; top: ${e.clientY}px; position: fixed;`));
}

export function setMenuPositions(e: PointerEvent) {
    // this is a fudge to make the menu show where the pointer was clicked
    _setMenuPositions(e);
    setTimeout(() => _setMenuPositions(e), 10);
    setTimeout(() => _setMenuPositions(e), 100);
}

export function debounce<T>(action: (args: T) => void, duration: number): (args: T) => void {
    let timer: NodeJS.Timeout;
    return (args: T) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            action(args);
        }, duration);
    };
}
