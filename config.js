// config.js
const UT_CONFIG = {
  // キャラクターごとの設定
  PRESETS: {
    Default: {
      font: "JF-Dot-Shinonome14.ttf",
      sound: "snd_talk_default.wav",
      face: "",
      antialias: false,
    },
    fnt_dotumche: {
      fontFamily: "'BIZ UDGothic', sans-serif",
      sound: "snd_talk_default.wav",
      face: "",
    },
  },

  // 吹き出し画像の一覧
  BUBBLES: [
    "spr_quote_bubble_battle_0.png",
    "spr_quote_bubble_battle_2_0.png",
    "spr_quote_bubble_battle_2_reverse_0.png",
    "spr_quote_bubble_battle_3_0.png",
    "spr_quote_bubble_battle_3_reverse_0.png",
    "spr_quote_bubble_battle_4_0.png",
    "spr_quote_bubble_battle_4_reverse_0.png",
    "spr_quote_bubble_battle_5_0.png",
    "spr_quote_bubble_battle_6_0.png",
    "spr_quote_bubble_battle_6_reverse_0.png",
  ],

  // モード別のレイアウト設定（幅、高さ、余白、字間、行間）
  LAYOUT: {
    // ① ノーマルモード（顔画像あり）
    normalWithFace: {
      width: 578,
      height: 152,
      padding: "20px",
      letterSpacing: "0px",
      lineHeight: "1.2",
    },
    // ② ノーマルモード（顔画像なし）
    normalWithoutFace: {
      width: 578,
      height: 152,
      padding: "20px 40px 20px 20px",
      letterSpacing: "0px",
      lineHeight: "1.2",
    },
    // ③ バトルバブルモード
    battleBubble: {
      width: 680,
      height: 320,
      padding: "18px 20px 10px 53px", // 左42px * 1.25 = 52.5px -> 53px
      letterSpacing: "0px",
      lineHeight: "1.2",
    },
    // ④ ショップモード（顔画像なし・大きめ）
    shop: {
      width: 700,
      height: 250,
      padding: "20px 30px 30px 60px",
      letterSpacing: "0px",
      lineHeight: "1.2",
    },
  },

  // 演出の微調整
  SETTINGS: {
    typeSpeed: 33, // 文字送り速度(ms)
    pauseDuration: 330, // '_' での停止時間(ms)
    defaultFontSize: 28, // 28 * 1
    bubbleFontSize: 30, // 20 * 1.5
    pauseSymbols: ["^"], // 停止記号を配列で指定（複数登録可能）
  },

  // --- スタイルチェック用のメッセージ定義 ---
  WARNING_MESSAGES: {
    // [全モード共通]
    halfMark: (chars) => ({
      jp: `${chars} は全角ではないですか？`,
      en: `Is ${chars} supposed to be full-width?`,
    }),
    halfEllipsis: {
      jp: `三点リーダーは全角(…)ではないですか？`,
      en: `Should the ellipsis be full-width (…)?`,
    },
    spaceAfterPeriod: {
      jp: `句点の後はスペースを入れません`,
      en: `Do not put a space after a period (。).`,
    },
    halfVoiced: {
      jp: `半濁点(、)は、基本使用されません`,
      en: `Commas (、) are generally not used.`,
    },
    fullParentheses: {
      jp: `()は半角にしてください`,
      en: `Please use half-width parentheses ().`,
    },
    halfQuotes: {
      jp: `クオーテーションマークは全角(“”)ではないですか？`,
      en: `Should quotation marks be full-width (“”)?`,
    },
    wrongQuoteOrder: {
      jp: `”“の順番が逆になっています（正：“テキスト” / 誤：”テキスト“）`,
      en: `The order of ” and “ is reversed (correct: “text”, wrong: ”text“).`,
    },
    spaceAfterQuestion: {
      jp: `！と？の後には全角スペースが必要です`,
      en: `A full-width space is required after ！ and ？.`,
    },
    halfNumber: {
      jp: `半角数字が単独で使われています（Gや%が付かない1桁の数字は原則全角）`,
      en: `A single half-width number is used without G or %.`,
    },
    soul: {
      jp: `ソウルではなくタマシイと表記してください`,
      en: `Please write 'タマシイ' instead of 'ソウル'.`,
    },
    periodBeforeParen: {
      jp: `丸括弧()の文末に句点(。)を付けないでください。`,
      en: `Do not put a period (。) at the end of a sentence inside parentheses ().`,
    },
    periodBeforeBracket: {
      jp: `鍵括弧「」の文末に句点(。)を付けないでください。`,
      en: `Do not put a period (。) at the end of a sentence inside brackets 「」.`,
    },

    // [ノーマル・ショップモード]
    spaceAfterAsterisk: {
      jp: `＊の後に半角スペースが必要です`,
      en: `A half-width space is required after ＊.`,
    },
    fullSpaceAfterAsterisk: {
      jp: `＊の後のスペースは全角ではなく半角です`,
      en: `The space after ＊ should be half-width, not full-width.`,
    },
    noSpaceBeforeAsterisk: {
      jp: `改行の後に＊を入れる場合、その前のスペースは必要ありません`,
      en: `When inserting ＊ after a line break, the preceding space is not necessary.`,
    },

    // [バトルバブルモード]
    noAsteriskInBattle: {
      jp: `バトルスピーチテキストに＊は使用しません`,
      en: `＊ is not used in battle speech text.`,
    },
    noPeriodInBattle: {
      jp: `バトルスピーチテキストではほとんど句点は使用されません`,
      en: `Periods (。) are rarely used in battle speech text.`,
    },
    noSpaceAfterNewlineInBattle: {
      jp: `バトルスピーチテキストでは改行後のスペースが必要ありません`,
      en: `Spaces after line breaks are not needed in battle speech text.`,
    },
  },
};
