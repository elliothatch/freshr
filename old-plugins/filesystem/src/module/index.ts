import * as chokidar from 'chokidar';
import * as Path from 'path';
import { promises as fs } from 'fs';
import { fromEventPattern, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Processor, Plugin } from 'freshr';

import { Socket } from 'socket.io';

import * as FileSystem from '../types';

const fileSystemModuleFactory: Plugin.Module.Factory = (options) => {
    const watchSubscribers: Set<Socket> = new Set();

    /** the state of the filesystem, updated as files are detected/added/deleted  */
    let files: FileSystem.Entry.Directory = {
        name: '/',
        path: '',

        fType: 'dir',
        contents: []
    };

    const fileUpdate$ = watchFile(options.projectPath);
    fileUpdate$.subscribe({
        next: (watchEvent) => {
            if(watchEvent.uri.length === 0) {
                // ignore root path changes, since we manually created the root entry
                // TODO: don't do this?
                return;
            }
            // update file structure
            if(watchEvent.eType === 'add' || watchEvent.eType === 'addDir') {
                const newEntry: FileSystem.Entry = Object.assign({
                    name: Path.basename(watchEvent.path),
                    path: watchEvent.uri,
                }, 
                watchEvent.eType === 'add'? {
                    fType: 'file' as const,
                }: {
                    fType: 'dir' as const,
                    contents: [],
                });

                files = addEntry(newEntry, files);
            }
            else if(watchEvent.eType === 'unlink' || watchEvent.eType === 'unlinkDir') {
                files = removeEntry(watchEvent.uri, files);
            }

            const output = {
                eType: watchEvent.eType,
                path: watchEvent.uri
            };

            // send update to subscribers
            watchSubscribers.forEach((socket) => {
                socket.emit('filesystem/watch', output);
            });
        }
    });
    return {
        websocketMiddleware: (socket, next) => {
            socket.on('filesystem/files', (data) => {
                socket.emit('filesystem/files', files);
            });

            socket.on('filesystem/watch', (data) => {
                watchSubscribers.add(socket);
            });

            socket.on('filesystem/unwatch', (data) => {
                watchSubscribers.delete(socket);
            });

            socket.on('disconnect', () => {
                watchSubscribers.delete(socket);
            });

            next();
        },
        /*
        buildSteps: {
            "sType": "task",
            // "definition": "react-rollup",
            "options": {
                "bundle": {
                    "format": "esm"
                }
            },
            "files": [{
                "inputs": {
                    "target": ["build/jsx/file-explorer.jsx"]
                },
                "outputs": {
                    "js": ["build/components/file-explorer.js"]
                }
            }]
        }
        */
    };
};

export default fileSystemModuleFactory;

/** returns a copy of the target directory entry, with the specified entry added
 * in the entry tree based on its 'path' property. assumes 'path' is relative to the same base directory as the entries in the target.
 * creates missing directory entries if needed
 */
export function addEntry(entry: FileSystem.Entry, target: FileSystem.Entry.Directory): FileSystem.Entry.Directory {
    const remainingPathParts = Path.relative(target.path, entry.path).split('/');
    if(remainingPathParts.length === 1) {
        if(target.contents.find((e) => e.path === entry.path)) {
            console.warn('filesystem:addEntry: tried to add duplicate entry', entry.path);
            return target;
        }
        return {
            ...target,
            contents: target.contents.concat([entry]),
        };
    }

    const nextDirectoryName = remainingPathParts[0];
    const nextDirectoryIndex = target.contents.findIndex((subEntry) => subEntry.fType === 'dir' && subEntry.name === nextDirectoryName);
    if(nextDirectoryIndex === -1) {
        const nextDirectory: FileSystem.Entry.Directory = {
            name: nextDirectoryName,
            path: `${target.path}/${nextDirectoryName}`,
            fType: 'dir',
            contents: [],
        };

        return addEntry(entry, {
            ...target,
            contents: target.contents.concat([nextDirectory]),
        });
    }

    const contents = target.contents.slice();
    contents[nextDirectoryIndex] = addEntry(entry, contents[nextDirectoryIndex] as FileSystem.Entry.Directory);

    return {
        ...target,
        contents,
    };
}

/** returns a copy of the target directory entry, with the file at the specified path removed
 * from the entry tree. assumes 'path' is relative to the same base directory as the entries in the target.
 */
export function removeEntry(path: string, target: FileSystem.Entry.Directory): FileSystem.Entry.Directory {
    const remainingPathParts = Path.relative(target.path, path).split('/');
    if(remainingPathParts.length === 1) {
        if(remainingPathParts[0] === 'build') {
        }
        return {
            ...target,
            contents: target.contents.filter((subEntry) => subEntry.path !== path),
        };
    }

    const nextDirectoryName = remainingPathParts[0];
    const nextDirectoryIndex = target.contents.findIndex((subEntry) => subEntry.fType === 'dir' && subEntry.name === nextDirectoryName);
    if(nextDirectoryIndex === -1) {
        // console.warn('filesystem:removeEntry: tried to remove nonexistent file entry', path);
        // NOTE: this tends to happen because chokidar sends the unlinkDir event before it sends the unlink events for the files in that directory
        return target;
    }

    const contents = target.contents.slice();
    contents[nextDirectoryIndex] = removeEntry(path, contents[nextDirectoryIndex] as FileSystem.Entry.Directory);

    return {
        ...target,
        contents
    };
}

/** returns a file entry structure, with files added/removed based on the watch event
 */
/*
export function updateFileStructure(entry: FileSystem.Entry, watchEvent: WatchEvent): FileSystem.Entry {
    const entryPathParts = entry.path.split('/');
    const watchPathParts = watchEvent.uri.split('/');

    // /root                      ['', 'root']
    // /root/test                  [''
    // /root/test/hello
    // /root/test/hello/hi.txdt
    //
    // /root/test/hola/chu/cho.txt
    //
    // /root
    //
    // /root/hello
    if(watchPathParts.length === entryPathParts.length + 1) {
    }
    else if(watchPathParts.length > entryPathParts.length) {
    }
    
    if(watchEvent.eType === 'unlink' || watchEvent.eType === 'unlinkDir') {
    }

    if(watchEvent.eType === 'add' || watchEvent.eType === 'addDir') {
        if(entry.path
    }
    if(entry.path === watchEvent.uri) {
        switch(watchEvent.eType) {
            case 'add':
                break;
            case 'unlink':
                break;
            case 'addDir':
                break;
            case 'unlinkDir':
                break;
            case 'change':
            default:
                break;
        }
    }
}
 */

/**
 * recursively watches a file/directory for changes
 */
export function watchFile(path: string): Observable<FileSystem.WatchEvent> {
    return fromEventPattern<[string, string]>((addHandler) => {
        const watcher = chokidar.watch(path);
        ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].forEach((eventName) => {
            watcher.on(eventName, (...args: any[]) => addHandler(eventName, ...args));
        });
    }).pipe(
        map(([eventType, filename]) => {
            return {
                eType: eventType,
                path: filename,
                uri: Path.relative(path, filename).replace(/\\/g, '/'),
            } as FileSystem.WatchEvent;
        })
    );
}

/**
 * Get the file entry for the specified path. If it is a directory recursively gets the directory contents. base path is not included in the 'path' property
 * @param basePath: path to the base directory
 * @param relativePath: relative path to the target file/directory
 * */
export function getEntry(basePath: string, relativePath: string): Promise<FileSystem.Entry> {
    const filePath = Path.join(basePath, relativePath);
    const name = Path.basename(relativePath);
    const path = relativePath.replace(/\\/g, '/');
    return fs.lstat(filePath).then((stats) => {
        if(stats.isFile()) {
            return {
                fType: 'file',
                name,
                path,
            };
        }
        else if(stats.isDirectory()) {
            return fs.readdir(filePath).then((files) => {
                return Promise.all(files.map((filename) => {
                    return getEntry(basePath, Path.join(relativePath, filename));
                }));
            }).then((entries) => {
                return {
                    fType: 'dir',
                    name,
                    path,
                    contents: entries
                };
            });
        }
        else {
            return {
                fType: 'unknown',
                name,
                path,
            };
        }
    });
}
