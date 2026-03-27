export const sunoVersions = [
  {
    code: "chirp-v3.0",
    label: "Suno v3.0",
    tier: "archive",
  },
  {
    code: "chirp-v3.5",
    label: "Suno v3.5",
    tier: "stable",
  },
  {
    code: "chirp-v4",
    label: "Suno v4",
    tier: "recommended",
  },
  {
    code: "chirp-auk",
    label: "Suno v4.5",
    tier: "pro",
  },
  {
    code: "chirp-bluejay",
    label: "Suno v4.5+",
    tier: "pro",
  },
  {
    code: "chirp-crow",
    label: "Suno v5",
    tier: "flagship",
  },
];

export const pricingCatalog = [
  {
    family: "suno",
    code: "suno_music",
    title: "Suno 主生成",
    price: 0.5,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "覆盖 Suno 主生成链路，前台版本切换需做版本到 SKU 的映射。",
  },
  {
    family: "suno",
    code: "suno_lyrics",
    title: "Suno 歌词生成",
    price: 0.5,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "用于提示词生成歌词任务。",
  },
  {
    family: "suno",
    code: "suno_stem",
    title: "Suno 音轨分离",
    price: 0.01,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "适合作为二期增强功能。",
  },
  {
    family: "suno",
    code: "suno_timing",
    title: "Suno 时间线",
    price: 0.01,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "可用于歌词高亮与逐句同步。",
  },
  {
    family: "suno",
    code: "suno_upload",
    title: "Suno 上传/续写",
    price: 0.01,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "支持上传续写、cover、replace section 等场景。",
  },
  {
    family: "suno",
    code: "suno_wav",
    title: "Suno WAV 获取",
    price: 0,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "适合导出高质量文件或后处理链路。",
  },
  {
    family: "minimax",
    code: "music-1.5",
    title: "海螺音乐 1.5",
    price: 0.3,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "适合作为首版第二模型入口。",
  },
  {
    family: "minimax",
    code: "music-2.0",
    title: "海螺音乐 2.0",
    price: 3,
    unit: "次",
    groups: ["default", "优质分组"],
    notes: "高客单版本，建议按业务定价策略决定是否首版开放。",
  },
];

export const recommendedPackages = [
  {
    code: "starter",
    name: "体验包",
    amount: 9.9,
    credits: 30,
    bonusCredits: 6,
    highlight: "低门槛试用",
    bestFor: "个人首次体验",
  },
  {
    code: "growth",
    name: "标准包",
    amount: 29.9,
    credits: 120,
    bonusCredits: 30,
    highlight: "首版推荐",
    popular: true,
    bestFor: "高频创作用户",
  },
  {
    code: "pro",
    name: "进阶包",
    amount: 99,
    credits: 450,
    bonusCredits: 80,
    highlight: "适合团队试运营",
    bestFor: "小团队和工作室",
  },
];

export const billingPolicy = {
  currency: "CNY",
  settlementMode: "central-wallet",
  checkoutMode: "manual-confirm",
  customerMinTopup: 9.9,
  upstreamMinTopup: 50,
  channels: ["微信", "支付宝"],
  notes: [
    "前台卖资源包，后台统一走供应商钱包结算，避免直接暴露上游充值限制。",
    "一期先做下单与人工确认，二期再接真实支付回调。",
    "组织版和个人版共用积分池逻辑，但订单、发票和配额隔离。",
  ],
};

export const organizationBlueprint = {
  ownerRole: {
    code: "company_owner",
    label: "音乐公司负责人",
    capabilities: [
      "创建组织与邀请成员",
      "管理组织积分包与充值订单",
      "查看团队任务与生成成本",
      "分配成员可用额度",
    ],
  },
  memberRole: {
    code: "company_member",
    label: "成员账号",
    capabilities: [
      "发起歌曲与歌词生成",
      "查看本人任务与作品",
      "消耗组织分配额度",
    ],
  },
  launchScopes: [
    "一期只做二级角色，不扩展更多层级。",
    "组织版独立订单与额度，不复用 ruoyi 运行时。",
    "线上个人付费版与组织版共用供应商代理层。",
  ],
};
