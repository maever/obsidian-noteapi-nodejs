import { MeiliSearch } from 'meilisearch';
import { CONFIG } from '../config.js';


export const meili = new MeiliSearch({ host: CONFIG.meili.host, apiKey: CONFIG.meili.key });
export const index = meili.index(CONFIG.meili.index);