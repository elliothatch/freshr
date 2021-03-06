import * as Path from 'path';
import { from } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { Hypermedia } from '../hypermedia';
import { Processor } from '../hypermedia/processor';
import { resourceMatchesProfile } from '../hal-util';

export const ConfigProcessor: Processor = {
    name: 'config',
    fn: (rs) => {
        if(!resourceMatchesProfile(rs.resource, '/schema/freshr/~config', rs.state.baseUri)) {
            return rs;
        }

        return { 
            ...rs,
            resource: {
                ...rs.resource ,
                'resourceCount': rs.state.resourceGraph.nodeCount(),
                'resourceEdgeCount': rs.state.resourceGraph.edgeCount(),
            }
        };
    }
};
