import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { BlockNoteView } from '@blocknote/mantine';
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileDeleteButton,
  FileReplaceButton,
  FormattingToolbar,
  FormattingToolbarController,
  NestBlockButton,
  UnnestBlockButton,
} from '@blocknote/react';
import type { Editor } from './schema';

/**
 * Presentational wrapper around BlockNote. Pass `readOnly` to render a page without
 * any editing affordances (used for future read-only share pages).
 */
export function BlockEditor({
  editor,
  readOnly = false,
  onChange,
}: {
  editor: Editor;
  readOnly?: boolean;
  onChange?: () => void;
}) {
  return (
    <BlockNoteView
      editor={editor}
      editable={!readOnly}
      theme="light"
      formattingToolbar={false}
      onChange={onChange}
    >
      <FormattingToolbarController
        formattingToolbar={() => (
          <FormattingToolbar>
            <BlockTypeSelect key="blockTypeSelect" />
            <FileCaptionButton key="fileCaptionButton" />
            <FileReplaceButton key="replaceFileButton" />
            <FileDeleteButton key="fileDeleteButton" />
            <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
            <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
            <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
            <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
            <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />
            <ColorStyleButton key="colorStyleButton" />
            <CreateLinkButton key="createLinkButton" />
            <NestBlockButton key="nestBlockButton" />
            <UnnestBlockButton key="unnestBlockButton" />
          </FormattingToolbar>
        )}
      />
    </BlockNoteView>
  );
}
