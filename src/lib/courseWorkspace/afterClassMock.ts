export interface EnterpriseChallengeItem {
  id: string;
  title: string;
  enterpriseName: string;
  enterpriseLogo: string;
  prizePool: string;
  teamsCount: number;
  deadline: string;
  tags: string[];
  description: string;
  requirements: string[];
}

export interface InnovationMarketItem {
  id: string;
  title: string;
  teamName: string;
  coverImage: string;
  likesCount: number;
  peerScore: number;
  tags: string[];
  summary: string;
  authorComment: string;
}

export interface FieldStudyVlogItem {
  id: string;
  title: string;
  author: string;
  location: string;
  duration: string;
  coverImage: string;
  tags: string[];
  summary: string;
  keyTakeaway: string;
}

export interface MentorReviewItem {
  id: string;
  mentorName: string;
  mentorTitle: string;
  mentorCompany: string;
  avatar: string;
  isAlumni: boolean;
  alumniClass?: string;
  targetProject: string;
  reviewScore: number;
  reviewText: string;
  careerAdvice: string;
  reviewedAt: string;
}

export const mockAfterClassData = {
  enterpriseChallenges: [
    {
      id: "chal-1",
      title: "【快消文创新品】‘东方茶韵’AIGC包装与海外社媒爆款传播方案",
      enterpriseName: "茶颜观色数字创新实验室",
      enterpriseLogo: "🍵",
      prizePool: "￥20,000 创业孵化基金",
      teamsCount: 12,
      deadline: "2026-09-15",
      tags: ["品牌出海", "包装设计", "AIGC营销"],
      description: "针对北美及东南亚年轻群体，结合中国茶文化母体，利用生成式AI工具输出完整的主视觉包装、故事叙事与TikTok/Instagram传播脚本。",
      requirements: [
        "提供至少3套AI生成的高清包装视觉渲染图",
        "撰写一份符合当地文化语境的跨文化传播脚本（中英双语）",
        "核算单套产品生产供应链打样成本与首批上架预算"
      ]
    },
    {
      id: "chal-2",
      title: "【数字文旅赋能】宋代临安古城沉浸式AI导览NPC剧本与交互设计",
      enterpriseName: "西湖文旅数字创意中心",
      enterpriseLogo: "🏯",
      prizePool: "￥35,000 落地合作奖金",
      teamsCount: 19,
      deadline: "2026-09-30",
      tags: ["沉浸文旅", "LLM智能体", "剧本杀"],
      description: "为清河坊历史街区定制5位宋代历史人物AI NPC（如苏轼、李清照等），实现与游客的语音交互引导与剧情探索，赋能线下文旅夜游经济。",
      requirements: [
        "设计5位历史NPC的Prompt设定集与对话安全约束边界",
        "提供包含支线探索任务的完整沉浸式导览动线规划",
        "完成基于WebGL/小程序端交互的原型演示视频"
      ]
    },
    {
      id: "chal-3",
      title: "【非遗出海创新】传统苏绣纹样数字化生成与跨境独立站原型建设",
      enterpriseName: "丝绸之路出海协同创新基地",
      enterpriseLogo: "🧵",
      prizePool: "￥15,000 产学转化奖金",
      teamsCount: 8,
      deadline: "2026-09-20",
      tags: ["非遗活化", "独立站", "跨境电商"],
      description: "解构国家级非遗苏绣的典型针法与纹样美学，建立AI风格化生成模型，并搭建面向欧美中产家居市场的跨境独立站展示原型。",
      requirements: [
        "提炼苏绣核心文化纹样基因库与AIGC工作流",
        "设计高品质独立站UI界面与文化故事专题页",
        "输出海外社媒KOL拓展与众筹上线策划方案"
      ]
    }
  ] as EnterpriseChallengeItem[],
  innovationMarket: [
    {
      id: "market-1",
      title: "《赛博敦煌·飞天霓裳》多模态动态数字壁画",
      teamName: "灵感未来实验室",
      coverImage: "🎨",
      likesCount: 342,
      peerScore: 92.5,
      tags: ["SDXL微调", "空间音频", "数字壁画"],
      summary: "融合敦煌莫高窟第112窟反弹琵琶飞天形象与赛博朋克霓虹美学，利用ControlNet重构丝路光影，配合定制国风电子音乐呈现沉浸视觉。",
      authorComment: "我们尝试用现代年轻人喜爱的科幻语汇重新激活古老石窟艺术，欢迎大家在互评区多提宝贵意见！"
    },
    {
      id: "market-2",
      title: "《三星堆青铜神树的低语》交互式AI叙事微游戏",
      teamName: "青铜觉醒小组",
      coverImage: "🌳",
      likesCount: 289,
      peerScore: 90.8,
      tags: ["LLM驱动", "分支叙事", "三星堆IP"],
      summary: "玩家扮演古蜀国寻宝学者，与AI模拟的‘青铜大立人’进行实时语言博弈，逐步解开三星堆文明迁徙与祭祀之谜。",
      authorComment: "游戏中所有NPC对话均挂载了三星堆考古学术知识库，兼顾严谨学术考据与戏剧张力。"
    },
    {
      id: "market-3",
      title: "《二十四节气江南水乡》AIGC国风绘本与数字藏品",
      teamName: "江南烟雨组",
      coverImage: "📖",
      likesCount: 215,
      peerScore: 88.4,
      tags: ["节气文化", "绘本创作", "数字版权"],
      summary: "针对儿童传统文化启蒙，使用AI生成24组江南水乡农耕与民俗生活画卷，配套AR识图互动与童声有声故事。",
      authorComment: "已完成全套绘本小样打样，并在两所小学进行了试读测试，孩子们反馈非常热烈！"
    }
  ] as InnovationMarketItem[],
  fieldStudyVlogs: [
    {
      id: "vlog-1",
      title: "【名企探营】走进腾讯数字文化实验室：探秘大模型在文化遗产活化中的前沿应用",
      author: "林思源（调研组长）",
      location: "深圳·腾讯滨海大厦",
      duration: "12:45",
      coverImage: "🏢",
      tags: ["企业探营", "大厂实践", "数字文保"],
      summary: "实地参访腾讯SSV数字文化实验室，观摩‘数字藏经洞’毫米级高精度三维建模与全真互联技术的落地全流程，并与技术专家面对面交流。",
      keyTakeaway: "‘真正的文化数字化不仅仅是视觉渲染，更核心的是底层严谨的文献知识图谱构建与标准规范制定。’"
    },
    {
      id: "vlog-2",
      title: "【田野考察】良渚文化大走廊实地调研：AIGC如何赋能乡村文旅特色IP？",
      author: "良渚实践小队",
      location: "杭州·良渚文化村与遗址公园",
      duration: "08:20",
      coverImage: "🌾",
      tags: ["田野调研", "乡村振兴", "文创孵化"],
      summary: "深入走访良渚当地20余家非遗文创工坊与研学基地，深度访谈手工艺人与游客，收集传统文化在文旅消费场景中的第一手痛点。",
      keyTakeaway: "‘商户最迫切需要的是低门槛、傻瓜式的AI内容生成工具，来降低日常自媒体运营与包装设计成本。’"
    },
    {
      id: "vlog-3",
      title: "【海外连线】中法文化交流年：数字艺术展览在巴黎卢浮宫策展背后的跨文化洞察",
      author: "陈雨菲（海外访学联络员）",
      location: "法国·巴黎",
      duration: "15:10",
      coverImage: "🗼",
      tags: ["海外访学", "跨文化策展", "国际视野"],
      summary: "跟随策展团队记录中国数字水墨艺术展在巴黎落地的全过程，剖析西方观众对中国传统美学与现代AI交互的真实接受度。",
      keyTakeaway: "‘跨文化传播不能靠概念生搬硬套，必须找到人类共同的情感触点与普适美学语言。’"
    }
  ] as FieldStudyVlogItem[],
  mentorReviews: [
    {
      id: "review-1",
      mentorName: "王建军",
      mentorTitle: "AI创新业务高级产品专家 / 算法负责人",
      mentorCompany: "字节跳动 Flow 业务部",
      avatar: "👨‍💼",
      isAlumni: true,
      alumniClass: "2016届 软件工程专业校友",
      targetProject: "《赛博敦煌·飞天霓裳》",
      reviewScore: 94,
      reviewText: "方案在视觉冲击力和文化母体提取上做得非常惊艳，达到了行业准商业化的水准！建议在后续工程化落地中，重点关注移动端低算力设备上的WebGL实时渲染帧率优化，避免过高的渲染开销影响交互流畅度。",
      careerAdvice: "文创科技复合型人才是当前行业最紧缺的方向，希望师弟师妹们在保持敏锐审美直觉的同时，继续深耕底层Prompt工程与工作流编排！",
      reviewedAt: "2026-08-18"
    },
    {
      id: "review-2",
      mentorName: "赵雅茹",
      mentorTitle: "数字化文旅重点实验室副主任 / 特聘教授",
      mentorCompany: "中国文化产业发展协同创新中心",
      avatar: "👩‍🏫",
      isAlumni: false,
      targetProject: "《良渚文化研学方案》",
      reviewScore: 91,
      reviewText: "非常欣慰看到同学们能紧密围绕教材第二章的五感沉浸理论开展研学动线设计。特别是把AI互动NPC作为启发式探究载体，完全摆脱了传统走马观花式研学的弊端，具有极强的示范推广价值。",
      careerAdvice: "做文旅项目切忌‘自嗨’，建议多深入一线场景与真实游客对话，持续验证用户体验指标。",
      reviewedAt: "2026-08-19"
    },
    {
      id: "review-3",
      mentorName: "张力",
      mentorTitle: "文创出海投资基金合伙人 / 创业导师",
      mentorCompany: "红杉文创孵化加速器",
      avatar: "🧑‍💼",
      isAlumni: true,
      alumniClass: "2012届 工商管理专业校友",
      targetProject: "《非遗苏绣出海独立站》",
      reviewScore: 88,
      reviewText: "定位欧美中产家居文创的痛点抓得很准，商业模式测算也初具雏形。需要提醒的是，跨境独立站的CAC（获客成本）在海外逐年攀升，建议方案中补充基于TikTok短视频矩阵的低成本冷启动策略。",
      careerAdvice: "商业世界既需要诗意的情怀，更需要冰冷的财务测算与风控意识，为你们扎实的实战精神点赞！",
      reviewedAt: "2026-08-20"
    }
  ] as MentorReviewItem[]
};
