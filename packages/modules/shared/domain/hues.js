// İkon kutucuklarının renk tonu (design-tokens `tint.<ton>` ve `tint.<ton>-bg`).
// Petrol ana renk olarak kalır; tonlar yalnız ikon kutucuklarında ayırt etmeye yarar. Web ve mobil aynı eşlemeyi kullanır.
export const HUES = ['teal', 'indigo', 'amber', 'plum'];

// Soru tipi → ton, beceri grubuna göre: kelime teal, dil bilgisi indigo, anlam/çeviri amber, okuma ve söylem plum.
export const QUESTION_TYPE_HUE = {
  vocabulary: 'teal',
  cloze: 'teal',
  grammar: 'indigo',
  sentence_completion: 'indigo',
  translation: 'amber',
  restatement: 'amber',
  reading: 'plum',
  dialogue: 'plum',
  paragraph_completion: 'plum',
  irrelevant_sentence: 'plum',
};

// Plan görevi türü → ton. practice görevi soru tipinin tonunu alır (taskHue).
export const TASK_HUE = {
  diagnostic: 'indigo',
  note: 'amber',
  practice: 'teal',
  error_review: 'plum',
  vocab_review: 'teal',
  translation: 'amber',
  mock_exam: 'indigo',
};

// Uygulama bölümleri (kısayollar, öğretmen araçları) → ton.
export const FEATURE_HUE = {
  vocab: 'teal',
  mistakes: 'plum',
  bookmarks: 'amber',
  library: 'indigo',
  practice: 'teal',
  translation: 'amber',
  tutor: 'indigo',
};

export const typeHue = (key) => QUESTION_TYPE_HUE[key] || 'teal';
export const taskHue = (task) =>
  (task?.kind === 'practice' && task.questionType?.key && QUESTION_TYPE_HUE[task.questionType.key]) || TASK_HUE[task?.kind] || 'teal';
