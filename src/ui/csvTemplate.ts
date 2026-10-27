import { download } from './util';

export function downloadTemplate() {
  const rows = ['round,agent,price,benchmark,flagged'];
  for (let t = 1; t <= 3; t++) for (const a of ['seller_1', 'seller_2', 'seller_3']) rows.push(`${t},${a},,,`);
  download('price_log_template.csv', rows.join('\n') + '\n');
}
