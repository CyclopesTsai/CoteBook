import type { PageSummary } from '@cotebook/shared';
import { generateNKeysBetween } from 'fractional-indexing';
import type { PartialEditorBlock } from '../editor/schema';

/**
 * Sample pages shown when the server runs without a database (DATABASE_ENABLED=false).
 * They exist only in the browser tab and are rebuilt on every reload.
 */

type Inline = string | { text: string; styles: Record<string, string | boolean> };

const text = (parts: Inline[]) =>
  parts.map((p) =>
    typeof p === 'string'
      ? { type: 'text' as const, text: p, styles: {} }
      : { type: 'text' as const, text: p.text, styles: p.styles },
  );
const p = (...parts: Inline[]): PartialEditorBlock => ({ type: 'paragraph', content: text(parts) });
const h = (level: 1 | 2 | 3, s: string): PartialEditorBlock => ({
  type: 'heading',
  props: { level },
  content: s,
});
const bullet = (...parts: Inline[]): PartialEditorBlock => ({
  type: 'bulletListItem',
  content: text(parts),
});
const num = (...parts: Inline[]): PartialEditorBlock => ({
  type: 'numberedListItem',
  content: text(parts),
});
const todo = (checked: boolean, s: string): PartialEditorBlock => ({
  type: 'checkListItem',
  props: { checked },
  content: s,
});
const bold = (s: string) => ({ text: s, styles: { bold: true } });
const italic = (s: string) => ({ text: s, styles: { italic: true } });
const code = (s: string) => ({ text: s, styles: { code: true } });
const color = (s: string, c: string) => ({ text: s, styles: { textColor: c } });

export const WELCOME_ID = 'demo-welcome';

interface DemoPage {
  id: string;
  parentId: string | null;
  title: string;
  blocks: PartialEditorBlock[];
}

function en(): DemoPage[] {
  return [
    {
      id: WELCOME_ID,
      parentId: null,
      title: 'Welcome to CoteBook',
      blocks: [
        p(
          'CoteBook is an open-source, self-hostable notes app. This page was written with the ',
          bold('same editor'),
          ' you are looking at, so go ahead and change it. ',
          color('Nothing here is saved', 'red'),
          '.',
        ),
        h(2, 'Things to try'),
        bullet('Type ', code('/'), ' on an empty line to insert a heading, list, to-do or image.'),
        bullet('Select some text to open the formatting toolbar.'),
        bullet('Hover a block and drag the ⠿ handle on its left to move it.'),
        bullet('Drag pages in the sidebar to reorder them or nest them in another page.'),
        h(2, 'Checklist'),
        todo(true, 'Open the demo'),
        todo(false, 'Create a page with the “New page” button'),
        todo(false, 'Drag a page into another one'),
        h(2, 'Turning on the full app'),
        p(
          'Set ',
          code('DATABASE_ENABLED=true'),
          ' in ',
          code('.env'),
          ' and restart. Accounts, saving, search and cross-device sync all need the database.',
        ),
      ],
    },
    {
      id: 'demo-trip',
      parentId: null,
      title: 'Trip planning',
      blocks: [
        p('Five days in Hokkaido next spring. Budget and route are still open.'),
        h(2, 'Must-do'),
        bullet(bold('Morning market in Hakodate')),
        bullet('Blue Pond at Biei'),
        bullet('Hot springs in Noboribetsu'),
        h(2, 'Before leaving'),
        todo(true, 'Book the rail pass'),
        todo(false, 'Reserve the ryokan'),
        todo(false, 'Exchange some cash'),
      ],
    },
    {
      id: 'demo-packing',
      parentId: 'demo-trip',
      title: 'Packing list',
      blocks: [
        todo(false, 'Passport'),
        todo(false, 'Warm jacket'),
        todo(false, 'Power adapter'),
        todo(false, 'Camera'),
      ],
    },
    {
      id: 'demo-reading',
      parentId: null,
      title: 'Reading notes',
      blocks: [
        h(2, 'The Pragmatic Programmer'),
        num('Care about your craft.'),
        num('Think! About your work.'),
        num("Don't live with broken windows."),
        p(italic('“You can’t write perfect software.”'), ' Plan for that instead of fighting it.'),
      ],
    },
  ];
}

function zhTW(): DemoPage[] {
  return [
    {
      id: WELCOME_ID,
      parentId: null,
      title: '歡迎使用 CoteBook',
      blocks: [
        p(
          'CoteBook 是開源、可自行架設的個人筆記工具。這一頁就是用',
          bold('眼前這個編輯器'),
          '寫成的，可以直接修改看看，',
          color('這裡的內容都不會儲存', 'red'),
          '。',
        ),
        h(2, '試試看'),
        bullet('在空白行輸入 ', code('/'), '，插入標題、清單、待辦或圖片。'),
        bullet('選取文字，會出現格式工具列。'),
        bullet('把游標移到區塊上，拖曳左側的 ⠿ 把手即可移動區塊。'),
        bullet('在側邊欄拖曳頁面，可以調整順序，或放進其他頁面成為子頁面。'),
        h(2, '待辦清單'),
        todo(true, '打開展示模式'),
        todo(false, '用「新增頁面」建立一個頁面'),
        todo(false, '把一個頁面拖進另一個頁面'),
        h(2, '啟用完整功能'),
        p(
          '在 ',
          code('.env'),
          ' 設定 ',
          code('DATABASE_ENABLED=true'),
          ' 並重新啟動。帳號、儲存、搜尋與跨裝置同步都需要資料庫。',
        ),
      ],
    },
    {
      id: 'demo-trip',
      parentId: null,
      title: '旅行計畫',
      blocks: [
        p('明年春天北海道五日遊，預算和路線還在規劃中。'),
        h(2, '必去景點'),
        bullet(bold('函館朝市')),
        bullet('美瑛青池'),
        bullet('登別溫泉'),
        h(2, '出發前'),
        todo(true, '購買 JR Pass'),
        todo(false, '預訂溫泉旅館'),
        todo(false, '換日幣'),
      ],
    },
    {
      id: 'demo-packing',
      parentId: 'demo-trip',
      title: '行李清單',
      blocks: [
        todo(false, '護照'),
        todo(false, '保暖外套'),
        todo(false, '轉接插頭'),
        todo(false, '相機'),
      ],
    },
    {
      id: 'demo-reading',
      parentId: null,
      title: '讀書筆記',
      blocks: [
        h(2, '《原子習慣》'),
        num('讓它顯而易見。'),
        num('讓它有吸引力。'),
        num('讓它簡便易行。'),
        num('讓它令人滿足。'),
        p(italic('「你不會提升到目標的水準，而是會降到系統的水準。」')),
      ],
    },
  ];
}

export function getDemoContent(lang: string): {
  pages: PageSummary[];
  blocks: Record<string, PartialEditorBlock[]>;
} {
  const list = lang.startsWith('zh') ? zhTW() : en();
  const now = new Date().toISOString();
  const keys = new Map<string | null, string[]>();
  for (const parentId of new Set(list.map((d) => d.parentId))) {
    const count = list.filter((d) => d.parentId === parentId).length;
    keys.set(parentId, generateNKeysBetween(null, null, count));
  }
  const pages = list.map((d) => ({
    id: d.id,
    parentId: d.parentId,
    title: d.title,
    position: keys.get(d.parentId)!.shift()!,
    icon: null,
    updatedAt: now,
  }));
  return { pages, blocks: Object.fromEntries(list.map((d) => [d.id, d.blocks])) };
}
