import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

const UserRole = {
  STUDENT: "STUDENT",
  TEACHER: "TEACHER"
} as const;

const CourseStatus = {
  ACTIVE: "ACTIVE"
} as const;

const ImportStatus = {
  READY_FOR_REVIEW: "READY_FOR_REVIEW"
} as const;

const InviteCodeKind = {
  COURSE: "COURSE",
  GROUP: "GROUP",
  DRIVE_SHARE: "DRIVE_SHARE",
  LIVE_SESSION: "LIVE_SESSION"
} as const;

const PublishStatus = {
  PUBLISHED: "PUBLISHED"
} as const;

const PlagiarismStatus = {
  COMPLETED: "COMPLETED"
} as const;

const LiveStatus = {
  SCHEDULED: "SCHEDULED",
  ENDED: "ENDED"
} as const;

async function reset() {
  await prisma.auditLog.deleteMany();
  await prisma.liveChatMessage.deleteMany();
  await prisma.liveParticipant.deleteMany();
  await prisma.liveSession.deleteMany();
  await prisma.plagiarismCheck.deleteMany();
  await prisma.driveShare.deleteMany();
  await prisma.groupFile.deleteMany();
  await prisma.topicResource.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.driveFile.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.groupComment.deleteMany();
  await prisma.groupPost.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.message.deleteMany();
  await prisma.topicSection.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.topicFolder.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.documentImportJob.deleteMany();
  await prisma.helpTicket.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.courseEnrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();
  await prisma.institution.deleteMany();
}

async function main() {
  await reset();

  const institution = await prisma.institution.create({
    data: {
      name: "北京市东城区第一图书馆",
      branding: "chaoxing-local"
    }
  });

  const teacherPassword = await hashPassword("Teacher@2026");
  const studentPassword = await hashPassword("Student@2026");

  const [teacher, secondTeacher, student] = await Promise.all([
    prisma.user.create({
      data: {
        name: "李素艳",
        email: "li.suyan@example.local",
        passwordHash: teacherPassword,
        avatar: "/avatars/li-suyan.png",
        role: UserRole.TEACHER,
        institutionId: institution.id
      }
    }),
    prisma.user.create({
      data: {
        name: "王一帆",
        email: "wang.yifan@example.local",
        passwordHash: teacherPassword,
        avatar: "/avatars/wang-yifan.png",
        role: UserRole.TEACHER,
        institutionId: institution.id
      }
    }),
    prisma.user.create({
      data: {
        name: "学习者",
        email: "student@example.local",
        passwordHash: studentPassword,
        avatar: "/avatars/student.png",
        role: UserRole.STUDENT,
        institutionId: institution.id
      }
    })
  ]);

  const aiCourse = await prisma.course.create({
    data: {
      title: "动手学AI：人工智能通识与实践（社科版）",
      description: "面向社科读者的人工智能通识与实践课程。",
      cover: "/covers/ai-course.jpg",
      term: "2026 春",
      status: CourseStatus.ACTIVE,
      ownerId: teacher.id,
      institutionId: institution.id,
      enrollments: {
        create: {
          userId: student.id,
          progress: 38
        }
      }
    }
  });

  const functionalCourse = await prisma.course.create({
    data: {
      title: "功能体验课",
      description: "用于体验课程章节、任务点和资料的示例课程。",
      cover: "/covers/demo-course.jpg",
      term: "2026 春",
      status: CourseStatus.ACTIVE,
      ownerId: teacher.id,
      institutionId: institution.id,
      enrollments: {
        create: {
          userId: student.id,
          progress: 72
        }
      },
      chapters: {
        create: [
          {
            title: "第一章 平台导览",
            summary: "熟悉个人空间、课程列表和学习入口。",
            order: 1,
            lessons: {
              create: [
                {
                  title: "个人空间导航",
                  summary: "认识首页、课程、收件箱和云盘。",
                  order: 1,
                  estimatedMinutes: 20,
                  keyPoints: "首页入口,课程卡片,侧边栏",
                  activities: "完成一次课程入口查找",
                  assessments: "说明个人空间主要模块"
                },
                {
                  title: "课程任务点",
                  summary: "理解章节、课时、资料和任务点完成状态。",
                  order: 2,
                  estimatedMinutes: 25,
                  keyPoints: "章节树,课时资料,任务点",
                  activities: "标记一个学习任务",
                  assessments: "解释任务点完成规则"
                }
              ]
            }
          },
          {
            title: "第二章 教师建课",
            summary: "体验教师课程空间和目录管理。",
            order: 2,
            lessons: {
              create: [
                {
                  title: "新建课程",
                  summary: "从教师课程列表创建课程。",
                  order: 1,
                  estimatedMinutes: 20,
                  keyPoints: "我教的课,新建课程,课程资料",
                  activities: "填写课程标题和简介",
                  assessments: "列出建课必填项"
                },
                {
                  title: "编辑目录",
                  summary: "维护章、课时和资源。",
                  order: 2,
                  estimatedMinutes: 30,
                  keyPoints: "章,课时,资料,发布",
                  activities: "新增一个课时",
                  assessments: "说明发布前检查点"
                }
              ]
            }
          }
        ]
      }
    }
  });

  const practiceCourse = await prisma.course.create({
    data: {
      title: "实操课",
      description: "本地图文资料和课堂任务实践。",
      cover: "/covers/practice.jpg",
      term: "2026 春",
      status: CourseStatus.ACTIVE,
      ownerId: secondTeacher.id,
      institutionId: institution.id,
      enrollments: {
        create: {
          userId: student.id,
          progress: 15
        }
      }
    }
  });

  await prisma.course.create({
    data: {
      title: "文化市场营销学",
      description: "公共文化服务场景中的市场营销基础。",
      cover: "/covers/marketing.jpg",
      term: "2025 秋",
      status: CourseStatus.ACTIVE,
      ownerId: teacher.id,
      institutionId: institution.id,
      enrollments: {
        create: {
          userId: student.id,
          progress: 100,
          completedAt: new Date()
        }
      }
    }
  });

  await prisma.announcement.create({
    data: {
      courseId: functionalCourse.id,
      authorId: teacher.id,
      title: "课程资料已更新",
      body: "请同学们查看第二章新增的建课案例。"
    }
  });

  await prisma.helpTicket.create({
    data: {
      courseId: functionalCourse.id,
      userId: student.id,
      subject: "无法打开课件",
      body: "第二章课件偶尔加载失败，请老师协助确认。"
    }
  });

  const topicFolder = await prisma.topicFolder.create({
    data: {
      title: "数字阅读服务",
      ownerId: teacher.id
    }
  });

  await prisma.topic.create({
    data: {
      title: "馆员 AI 素养专题",
      description: "面向馆员的 AI 通识专题。",
      folderId: topicFolder.id,
      ownerId: teacher.id,
      status: PublishStatus.PUBLISHED,
      sections: {
        create: [
          {
            title: "专题目标",
            body: "帮助馆员理解 AI 工具在阅读推广中的边界和用法。",
            order: 1
          }
        ]
      }
    }
  });

  await prisma.message.createMany({
    data: [
      {
        senderId: secondTeacher.id,
        receiverId: teacher.id,
        subject: "教研活动确认",
        body: "本周四下午进行课程建设交流。",
        readAt: null
      },
      {
        senderId: student.id,
        receiverId: teacher.id,
        subject: "学习问题",
        body: "老师您好，我想请教 AI 课程第三讲的作业要求。"
      },
      {
        senderId: teacher.id,
        receiverId: student.id,
        subject: "作业反馈",
        body: "你的学习笔记结构清楚，请补充案例来源。"
      }
    ]
  });

  const group = await prisma.group.create({
    data: {
      name: "AI 课程共创小组",
      description: "教师与学习者共同讨论课程资源和活动设计。",
      isOpen: true,
      members: {
        create: [
          { userId: teacher.id, role: "owner" },
          { userId: secondTeacher.id, role: "member" },
          { userId: student.id, role: "member" }
        ]
      },
      posts: {
        create: [
          {
            authorId: teacher.id,
            title: "欢迎共创课程资料",
            body: "请把适合社科读者的 AI 案例发到本小组。",
            comments: {
              create: [
                {
                  authorId: student.id,
                  body: "我整理了一份数字阅读案例。"
                }
              ]
            }
          },
          {
            authorId: secondTeacher.id,
            title: "活动复盘模板",
            body: "建议把目标、过程、数据和反馈作为复盘四栏。"
          }
        ]
      }
    }
  });

  await prisma.note.create({
    data: {
      ownerId: teacher.id,
      courseId: aiCourse.id,
      title: "AI 课程导入想法",
      body: "从数字阅读服务文档中提取章节，强调工具边界和案例复盘。",
      tags: {
        create: [
          { ownerId: teacher.id, name: "AI" },
          { ownerId: teacher.id, name: "建课" }
        ]
      }
    }
  });

  await prisma.note.create({
    data: {
      ownerId: teacher.id,
      courseId: functionalCourse.id,
      title: "功能体验课问题",
      body: "后续补充任务点完成率展示。",
      tags: {
        create: [{ ownerId: teacher.id, name: "课程" }]
      }
    }
  });

  await prisma.note.create({
    data: {
      ownerId: student.id,
      courseId: functionalCourse.id,
      title: "学习笔记",
      body: "课程空间左侧导航包含首页、课程、小组、笔记和云盘。",
      tags: {
        create: [{ ownerId: student.id, name: "学习" }]
      }
    }
  });

  const rootFolder = await prisma.driveFile.create({
    data: {
      ownerId: teacher.id,
      name: "课程资料",
      kind: "folder"
    }
  });

  const driveFile = await prisma.driveFile.create({
    data: {
      ownerId: teacher.id,
      parentId: rootFolder.id,
      name: "数字阅读服务培训.md",
      kind: "file",
      mimeType: "text/markdown",
      size: 1260,
      path: ".uploads/seed/digital-reading.md"
    }
  });

  await prisma.resource.create({
    data: {
      courseId: functionalCourse.id,
      title: "平台导览资料",
      type: "drive",
      driveFileId: driveFile.id
    }
  });

  await prisma.driveShare.create({
    data: {
      fileId: driveFile.id,
      ownerId: teacher.id,
      code: "DRIVE2026"
    }
  });

  await prisma.groupFile.create({
    data: {
      groupId: group.id,
      uploaderId: teacher.id,
      driveFileId: driveFile.id,
      title: "数字阅读服务培训"
    }
  });

  await prisma.plagiarismCheck.create({
    data: {
      ownerId: teacher.id,
      title: "活动策划稿检测",
      status: PlagiarismStatus.COMPLETED,
      similarity: 22,
      riskLevel: "低",
      reportJson: JSON.stringify({
        matchedPassages: [
          {
            source: "馆员培训样例库",
            text: "活动目标、用户分层、宣传渠道和复盘指标存在少量重合。"
          }
        ]
      })
    }
  });

  const liveSession = await prisma.liveSession.create({
    data: {
      title: "AI 课程答疑直播",
      description: "围绕文档建课和目录调整答疑。",
      hostId: teacher.id,
      status: LiveStatus.SCHEDULED,
      startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      participants: {
        create: [{ userId: student.id }]
      }
    }
  });

  await prisma.liveSession.create({
    data: {
      title: "功能体验课回放",
      description: "演示课程空间基础功能。",
      hostId: teacher.id,
      status: LiveStatus.ENDED,
      startsAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
      endedAt: new Date(Date.now() - 1000 * 60 * 60 * 47),
      participants: {
        create: [
          {
            userId: student.id,
            joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
            leftAt: new Date(Date.now() - 1000 * 60 * 60 * 47)
          }
        ]
      },
      messages: {
        create: [
          {
            userId: teacher.id,
            body: "今天我们演示课程、资料和小组协作。"
          }
        ]
      }
    }
  });

  await prisma.inviteCode.createMany({
    data: [
      {
        code: "COURSE2026",
        kind: InviteCodeKind.COURSE,
        targetId: practiceCourse.id,
        maxUses: 50
      },
      {
        code: "GROUP2026",
        kind: InviteCodeKind.GROUP,
        targetId: group.id,
        maxUses: 50
      },
      {
        code: "DRIVE2026",
        kind: InviteCodeKind.DRIVE_SHARE,
        targetId: driveFile.id,
        maxUses: 50
      },
      {
        code: "LIVE2026",
        kind: InviteCodeKind.LIVE_SESSION,
        targetId: liveSession.id,
        maxUses: 50
      }
    ]
  });

  await prisma.documentImportJob.create({
    data: {
      courseId: aiCourse.id,
      userId: teacher.id,
      status: ImportStatus.READY_FOR_REVIEW,
      originalName: "数字阅读服务培训.md",
      extractedText: "数字阅读服务培训\n服务认知\n活动策划\n数据分析",
      generatedOutline: JSON.stringify({
        title: "数字阅读服务培训",
        description: "根据馆员服务文档生成的课程目录。",
        targetAudience: "公共图书馆馆员",
        learningObjectives: ["理解服务入口", "设计阅读活动", "使用数据复盘"],
        chapters: []
      })
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: teacher.id,
      action: "seed",
      entity: "database",
      metadata: JSON.stringify({ institution: institution.name })
    }
  });

  console.log("Seeded users:", [teacher.name, secondTeacher.name, student.name].join(", "));
  console.log(
    "Seeded courses:",
    [aiCourse.title, functionalCourse.title, practiceCourse.title, "文化市场营销学"].join(", ")
  );
  console.log(
    "Dev credentials:\n- li.suyan@example.local / Teacher@2026\n- wang.yifan@example.local / Teacher@2026\n- student@example.local / Student@2026"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
