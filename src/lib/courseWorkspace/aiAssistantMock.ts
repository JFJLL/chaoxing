export type AiAssistantTab = "real-tutor" | "tutor" | "scenario-quiz" | "proposal-review" | "roleplay" | "knowledge-cards";

export interface KnowledgeBaseQaItem {
  id: string;
  question: string;
  answer: string;
  citations: Array<{ source: string; chapter: string; page?: number }>;
  relatedTopics: string[];
}

export interface DiagnosticQuizItem {
  id: string;
  stem: string;
  type: "single_choice" | "multiple_choice" | "short_answer";
  options?: string[];
  correctAnswer: string;
  analysis: string;
  masteryRate: number;
}

export interface ProposalReviewRubricItem {
  dimension: string;
  score: number;
  maxScore: number;
  theoryMapping: string;
  comment: string;
}

export interface RoleplayPersona {
  id: string;
  name: string;
  role: string;
  avatar: string;
  tone: string;
  goals: string[];
  initialGreeting: string;
  samplePrompts: string[];
}

export interface KnowledgeFlashcard {
  id: string;
  title: string;
  unit: string;
  coreConcept: string;
  frameworkPoints: string[];
  caseExample: string;
}

export const mockAiAssistantData = {
  qaItems: [
    {
      id: "qa-1",
      question: "文化创新理论中的‘价值共创模型’在AI时代有哪些新特征？",
      answer: "在AI时代，价值共创从传统的‘企业-消费者’双向互动拓展为‘算法-创作者-用户’的三元共生体系。AI作为生成式中介加速了创意迭代周期，用户不仅是内容消费者，更是Prompt指令设计者与训练语料贡献者。",
      citations: [
        { source: "教材主干理论讲义", chapter: "第二章·数字文化生态", page: 45 },
        { source: "产教前沿参考资料", chapter: "生成式AI与文化产业重塑", page: 12 }
      ],
      relatedTopics: ["价值共创", "生成式AI", "文化生态"]
    },
    {
      id: "qa-2",
      question: "如何设计针对出海文创方案的结构化商业闭环？",
      answer: "依据教材第四章商业画布模型，文创出海应遵循三步闭环：① 文化内核解构（提炼普适情感符号）；② 本地化叙事转译（结合海外主流社媒算法与受众画像）；③ 多元变现链路（IP授权、数字藏品与实体联名）。",
      citations: [
        { source: "教材主干理论讲义", chapter: "第四章·文创商业模式与出海", page: 88 }
      ],
      relatedTopics: ["商业模式", "文化出海", "IP商业化"]
    }
  ] as KnowledgeBaseQaItem[],
  scenarioQuiz: {
    scenarioTitle: "【课堂实战情境】国潮老字号跨界AI潮玩出海策略推演",
    scenarioDescription: "某具有百年历史的非遗丝绸品牌计划利用AIGC技术推出面向北美市场的国风数字潮玩。当前团队面临‘传统非遗元素过于复杂’与‘海外Z世代文化认同门槛高’两大挑战。",
    classMasteryRate: 85,
    radarStats: [
      { label: "理论迁移能力", value: 88 },
      { label: "痛点定位准确度", value: 82 },
      { label: "AIGC工具适配性", value: 90 },
      { label: "商业闭环设计", value: 78 },
      { label: "风险防范意识", value: 86 }
    ],
    quizzes: [
      {
        id: "q-1",
        stem: "面对海外Z世代受众，以下哪项叙事重构策略最符合教材中的‘跨文化转译’原则？",
        type: "single_choice",
        options: [
          "A. 完整保留原版古籍文献与生僻文言文注释",
          "B. 提取丝绸工艺中的色彩与纹样，结合赛博朋克等全球流行视觉符号进行AI二创",
          "C. 完全抛弃传统元素，直接使用欧美经典神话IP",
          "D. 仅通过机器翻译直译传统神话故事" 
        ],
        correctAnswer: "B",
        analysis: "教材第三章强调跨文化转译需要‘保留核心视觉母体，融入目标市场符号语境’。选项B完美兼顾文化本真性与海外受众接纳度。",
        masteryRate: 92
      },
      {
        id: "q-2",
        stem: "在评估方案中的AIGC生成内容商业化风险时，必须优先防范哪些合规要素？（多选）",
        type: "multiple_choice",
        options: [
          "A. 训练数据集与生成图像的版权确权问题",
          "B. 跨文化背景下的文化挪用与宗教风俗禁忌",
          "C. 用户生成内容（UGC）的合规审核机制",
          "D. 产品定价是否高于同类竞品" 
        ],
        correctAnswer: "A, B, C",
        analysis: "依据教材第六章知识产权与伦理规范，A、B、C项直接涉及法律与社会伦理红线，属于首要合规要素。",
        masteryRate: 78
      }
    ] as DiagnosticQuizItem[]
  },
  proposalFeedback: {
    proposalTitle: "《基于生成式AI的良渚文化多模态研学方案初稿》",
    submitter: "第七小组（组长：张逸飞）",
    overallScore: 89,
    rubrics: [
      { dimension: "理论框架契合度", score: 23, maxScore: 25, theoryMapping: "教材第二章·情境沉浸体验模型", comment: "研学路线设计深度融合了沉浸式体验五感模型，理论映射明确。" },
      { dimension: "真实痛点精准度", score: 22, maxScore: 25, theoryMapping: "教材第三章·文旅受众需求画像", comment: "青少年研学注意力易涣散的痛点定位准确，有充分的数据调研支撑。" },
      { dimension: "技术赋能可行性", score: 22, maxScore: 25, theoryMapping: "教材第五章·多模态AIGC工作流", comment: "采用的LoRA微调与互动式NPC方案具备可操作性，算力成本估算基本合理。" },
      { dimension: "商业与社会价值", score: 22, maxScore: 25, theoryMapping: "教材第七章·文化公益与商业平衡", comment: "兼顾了文化普及公益性与研学文创产品变现，落地预期清晰。" }
    ] as ProposalReviewRubricItem[],
    strengths: [
      "方案结构严谨，完整的六步研学任务驱动链路设计合理；",
      "AIGC互动环节与良渚玉器、纹饰知识点结合紧密，非形式主义堆砌；",
      "预设了现场应急预案与导师带队引导机制。"
    ],
    suggestions: [
      "【对照教材P112】进一步细化NPC角色的对话边界，防止学生提问产生大模型幻觉；",
      "【对照教材P148】增加对研学后知识沉淀的评估量规，完善形成性评价闭环；",
      "建议补充与当地博物馆官方合作的版权授权协议预备方案。"
    ]
  },
  roleplayPersonas: [
    {
      id: "persona-1",
      name: "周总监",
      role: "某头部文旅集团商业开发部负责人",
      avatar: "🏢",
      tone: "务实沉稳、关注投产比（ROI）、重视项目落地周期与法律合规",
      goals: ["探明项目预算与开发周期", "评估游客复购率与二次消费潜力", "确认文化IP授权风险"],
      initialGreeting: "你好，我是文旅集团商业开发部的周总。看了你们小组递交的AI研学方案初稿，想法挺有活力。不过我们投资部门最看重的是落地可行性和投资回报，你能先跟我聊聊这个项目的核心盈利点和预计周期吗？",
      samplePrompts: [
        "周总您好，我们方案的核心盈利主要分为三块：定制研学门票、AI互动衍生文创与线上数字勋章。",
        "关于落地周期，我们前期已完成模型微调原型，预计首期部署可在6周内完成上线。",
        "在IP合规方面，我们已取得良渚文创基地开源授权白名单。"
      ]
    },
    {
      id: "persona-2",
      name: "安安（00后玩家）",
      role: "重度国风潮玩与剧本杀爱好者",
      avatar: "🎮",
      tone: "热情直接、注重审美细节、反感说教式内容、喜欢强互动与社交打卡",
      goals: ["寻找新奇视觉体验", "测试AI NPC对话趣味性", "评估拍照打卡与社交分享意愿"],
      initialGreeting: "哈喽！听朋友说你们在做一个古风AI交互游戏？如果只是让我答题背历史那我可不来哦！你们这个游戏里有什么特别酷的玩法能让我发朋友圈吗？",
      samplePrompts: [
        "放心安安，我们这里没有填鸭答题！你可以给NPC‘玉琮守护者’设计专属个性，还能用AI实时生成你专属的玉器图腾！",
        "每通过一个关卡，系统会自动生成一段符合你专属风格的高清国风变身短视频，支持一键分享。"
      ]
    }
  ] as RoleplayPersona[],
  knowledgeCards: [
    {
      id: "card-1",
      title: "文化符号的‘三层结构模型’",
      unit: "第一单元：文化创新基础",
      coreConcept: "文化符号由表层物质文化、中层制度行为文化、深层精神价值观念文化组成。文化创新的本质是借助现代技术载体，激活深层精神内涵。",
      frameworkPoints: [
        "表层：器物、色彩、纹样、音效",
        "中层：仪式、社交规则、体验流程",
        "深层：哲学思想、民族认同、审美追求"
      ],
      caseExample: "《黑神话：悟空》通过表层陕北说书与古刹扫描，传递深层东方英雄史诗与反抗命运精神。"
    },
    {
      id: "card-2",
      title: "生成式AI在文创中的‘人机协同四阶梯’",
      unit: "第二单元：AI赋能与数字内容",
      coreConcept: "人机协同经历了工具替代、创意激发、共创共生、自主进化的演进历程，当前文创核心在于‘人类负责方向把控与价值审视，AI负责海量发散与素材合成’。",
      frameworkPoints: [
        "阶段1：AI作为执行工具（绘图/翻译）",
        "阶段2：AI作为头脑风暴伙伴（Prompt发散）",
        "阶段3：AI与人类双向反馈共创",
        "阶段4：自主Agent生态演进"
      ],
      caseExample: "利用Midjourney生成千套国风纹样概念草图，设计师挑选并矢量化精修形成产品线。"
    },
    {
      id: "card-3",
      title: "产教融合‘真题真做’解题工作法",
      unit: "第三单元：产教融合实战",
      coreConcept: "跳出纯学术假想，紧扣企业真实业务痛点，以成果转化与受众验证为唯一验收标准，构建‘调研-破题-原型-路演-复盘’全周期闭环。",
      frameworkPoints: [
        "需求真：直接对接企业命题人真实诉求",
        "解法实：技术选型符合企业实际预算与周期",
        "评价全：引入企业导师、行业专家与用户多维打分"
      ],
      caseExample: "某高校与文旅集团联合开设挑战赛，获胜小组的数字NPC方案直接落地景区小程序。"
    }
  ] as KnowledgeFlashcard[]
};
