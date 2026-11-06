import { BookOpenText, ClipboardList, Languages, Layers, ListX, MessagesSquare, PencilLine, Pilcrow, Puzzle, Repeat2, RotateCcw, SpellCheck, StickyNote, Target, TextCursorInput } from 'lucide-react';

// Soru tipi ve plan görevi ikonları (mobil: src/shared/ui/studyIcons.js aynı eşleme).
export const TYPE_ICON = {
  vocabulary: SpellCheck,
  cloze: TextCursorInput,
  grammar: Puzzle,
  sentence_completion: PencilLine,
  translation: Languages,
  restatement: Repeat2,
  reading: BookOpenText,
  dialogue: MessagesSquare,
  paragraph_completion: Pilcrow,
  irrelevant_sentence: ListX,
};
export const TASK_ICON = {
  diagnostic: Target,
  note: StickyNote,
  practice: PencilLine,
  error_review: RotateCcw,
  vocab_review: Layers,
  translation: Languages,
  mock_exam: ClipboardList,
};
export const typeIcon = (key) => TYPE_ICON[key] || BookOpenText;
export const taskIcon = (task) => (task?.kind === 'practice' && TYPE_ICON[task.questionType?.key]) || TASK_ICON[task?.kind] || PencilLine;
