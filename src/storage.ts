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

import { getLogger } from "log4js";

const log = getLogger('Storage');

function genFullKey(short: string): string {
    return `mx_f_${short}`;
}

export function storeValue(key: string, value: any) {
    const fullKey = genFullKey(key);
    log.debug(`localStorage.setItem(${fullKey}) = ${value}`);
    localStorage.setItem(fullKey, JSON.stringify(value));
}

export function readValueNoDefault<T>(key: string): T | undefined {
    return readValue(key, undefined);
}

export function readValue<T>(key: string, def: T): T {
    const fullKey = genFullKey(key);
    const val = localStorage.getItem(fullKey);
    log.debug(`localStorage.getItem(${fullKey}) = ${val}`);
    if (val === null || val === undefined) return def;
    try {
        return JSON.parse(val);
    } catch (e) {
        storeValue(fullKey, def);
        return def;
    }
}
