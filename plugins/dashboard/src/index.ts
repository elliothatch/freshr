import { Plugin } from 'freshr';

// import Processors from './processors';
// import TaskDefinitions from './task-definitions';


const dashboardModuleFactory: Plugin.Module.Factory = (options, freshr) => {
    const websocketMiddleware: Plugin.WebsocketMiddleware | undefined = 
        !options.hypermedia? undefined:
        (socket, fn) => {
            const buildUrl = options.hypermedia!.baseUrl + '/build';
            socket.on(buildUrl, (data) => {
                if(data.method === "POST") {
                    // trigger a build
                    freshr.build.build(freshr.build.buildSteps['demo']).subscribe({
                        next: (event) => {
                            socket.emit(buildUrl, event);
                        },
                        error: (error) => {
                            socket.emit(buildUrl, error);
                        }
                    });
                }
                else {
                    // subscribe 
                }
            });
    };
    return {
        // processorGenerators: Processors,
        // taskDefinitions: TaskDefinitions,
        websocketMiddleware,

        // profileLayouts: {
            // '/schema/post': 'layouts/post.hbs',
            // '/schema/index/schema/post': 'core/layouts/index.hbs',
            // '/schema/index/schema/index/tags': 'core/layouts/tags-index.hbs',
            // '/schema/freshr/resource-graph': 'core/layouts/resource-graph.hbs',
        // }
    };
};

export default dashboardModuleFactory;
