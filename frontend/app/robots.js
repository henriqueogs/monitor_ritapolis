import { SITE_URL } from './lib/brand';
import { buildRobotsRules } from '../lib/robots-rules';

export default function robots() {
  return {
    rules: buildRobotsRules(),
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
