import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';

/**
 * The block types available in the editor. Only the first-release set is enabled;
 * more of BlockNote's built-in blocks (toggle, quote, code, table, ...) can be switched
 * on here later without any change to the storage format.
 */
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    image: defaultBlockSpecs.image,
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});

export type Editor = typeof schema.BlockNoteEditor;
export type EditorBlock = typeof schema.Block;
export type PartialEditorBlock = typeof schema.PartialBlock;
