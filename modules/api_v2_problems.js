// API v2 - 题目相关接口
// 提供题目列表、详情、统计等功能

let Problem = syzoj.model('problem');
let JudgeState = syzoj.model('judge_state');
let Contest = syzoj.model('contest');
let ProblemTag = syzoj.model('problem_tag');
let Article = syzoj.model('article');

// 获取题目列表
app.get('/api/v2/problems', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const sort = req.query.sort || syzoj.config.sorting.problem.field;
    const order = req.query.order || syzoj.config.sorting.problem.order;
    const keyword = req.query.keyword;
    const tagId = req.query.tag;

    // 验证排序参数
    if (!['id', 'title', 'rating', 'ac_num', 'submit_num', 'ac_rate', 'publicize_time'].includes(sort) || 
        !['asc', 'desc'].includes(order)) {
      throw new ErrorMessage('错误的排序参数。');
    }

    let query = Problem.createQueryBuilder();

    // 权限过滤
    if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_problem')) {
      if (res.locals.user) {
        query.where('is_public = 1')
             .orWhere('user_id = :user_id', { user_id: res.locals.user.id });
      } else {
        query.where('is_public = 1');
      }
    }

    // 关键词搜索
    if (keyword) {
      const id = parseInt(keyword) || 0;
      if (res.locals.user && await res.locals.user.hasPrivilege('manage_problem')) {
        query.andWhere(new TypeORM.Brackets(qb => {
          qb.where('title LIKE :title', { title: `%${keyword}%` })
            .orWhere('id = :id', { id: id });
        }));
      } else {
        const currentCondition = query.getQuery();
        query = Problem.createQueryBuilder();
        query.where(new TypeORM.Brackets(qb => {
          if (res.locals.user) {
            qb.where('is_public = 1')
              .orWhere('user_id = :user_id', { user_id: res.locals.user.id });
          } else {
            qb.where('is_public = 1');
          }
        })).andWhere(new TypeORM.Brackets(qb => {
          qb.where('title LIKE :title', { title: `%${keyword}%` })
            .orWhere('id = :id', { id: id });
        }));
      }
    }

    // 标签过滤
    if (tagId) {
      const tagIds = tagId.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (tagIds.length > 0) {
        for (const id of tagIds) {
          query.andWhere(':tagId = ANY(string_to_array(tag_ids, \',\')::int[])', { tagId: id });
        }
      }
    }

    // 排序
    if (sort === 'ac_rate') {
      query.orderBy('CASE WHEN submit_num = 0 THEN 0 ELSE ac_num * 1.0 / submit_num END', order.toUpperCase());
    } else {
      query.orderBy(sort, order.toUpperCase());
    }

    // 分页
    const paginate = syzoj.utils.paginate(await Problem.countForPagination(query), page, syzoj.config.page.problem);
    const problems = await Problem.queryPage(paginate, query);

    // 加载额外信息
    await problems.forEachAsync(async problem => {
      problem.allowedEdit = await problem.isAllowedEditBy(res.locals.user);
      problem.judge_state = await problem.getJudgeState(res.locals.user, true);
      problem.tags = await problem.getTags();
    });

    // 获取标签信息（如果有标签过滤）
    let tags = null;
    if (tagId) {
      const tagIds = tagId.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (tagIds.length > 0) {
        tags = await ProblemTag.find({
          where: { id: TypeORM.In(tagIds) }
        });
      }
    }

    res.send({
      success: true,
      data: {
        problems: problems.map(problem => ({
          id: problem.id,
          title: problem.title,
          is_public: problem.is_public,
          ac_num: problem.ac_num,
          submit_num: problem.submit_num,
          ac_rate: problem.submit_num > 0 ? (problem.ac_num / problem.submit_num * 100).toFixed(2) : '0.00',
          tags: problem.tags,
          judge_state: problem.judge_state,
          allowedEdit: problem.allowedEdit,
          url: syzoj.utils.makeUrl(['problem', problem.id])
        })),
        pagination: paginate,
        filters: {
          sort: sort,
          order: order,
          keyword: keyword,
          tags: tags
        }
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取题目列表失败',
      error: e.message
    });
  }
});

// 获取题目详情
app.get('/api/v2/problems/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const contest_id = req.query.contest_id;
    let contest = null;

    const problem = await Problem.findById(id);
    if (!problem) {
      return res.send({
        success: false,
        message: '无此题目。'
      });
    }

    // 权限检查
    if (!await problem.isAllowedUseBy(res.locals.user)) {
      return res.send({
        success: false,
        message: '您没有权限访问此题目。'
      });
    }

    // 检查是否在比赛中
    if (contest_id) {
      contest = await Contest.findById(contest_id);
      if (contest && !await contest.isRunning()) {
        contest = null;
      }
    }

    // 加载相关数据
    await problem.loadRelationships();
    problem.allowedEdit = await problem.isAllowedEditBy(res.locals.user);
    problem.allowedManage = await problem.isAllowedManageBy(res.locals.user);

    const tags = await problem.getTags();
    const testcases = await problem.getTestdataInfo();
    
    // 获取讨论数量
    let discussionCount = 0;
    if (!contest) {
      discussionCount = await Article.count({
        where: { problem_id: problem.id }
      });
    }

    // 获取用户提交状态
    let judge_state = null;
    if (res.locals.user) {
      judge_state = await problem.getJudgeState(res.locals.user, contest !== null);
    }

    // 获取编程语言配置
    const languages = contest && contest.languages ? 
      JSON.parse(contest.languages) : null;

    res.send({
      success: true,
      data: {
        problem: {
          id: problem.id,
          title: problem.title,
          description: problem.description,
          input_format: problem.input_format,
          output_format: problem.output_format,
          example: problem.example,
          limit_and_hint: problem.limit_and_hint,
          memory_limit: problem.memory_limit,
          time_limit: problem.time_limit,
          type: problem.type,
          file_io: problem.file_io,
          file_io_input_name: problem.file_io_input_name,
          file_io_output_name: problem.file_io_output_name,
          is_public: problem.is_public,
          is_anonymous: problem.is_anonymous,
          allowedEdit: problem.allowedEdit,
          allowedManage: problem.allowedManage,
          user: problem.user ? {
            id: problem.user.id,
            username: problem.user.username
          } : null,
          publicizer: problem.publicizer ? {
            id: problem.publicizer.id,
            username: problem.publicizer.username
          } : null,
          tags: tags,
          additional_file: problem.additional_file ? {
            url: syzoj.utils.makeUrl(['problem', problem.id, 'download', 'additional_file'])
          } : null
        },
        testcases: testcases,
        discussionCount: discussionCount,
        contest: contest ? {
          id: contest.id,
          title: contest.title,
          running: contest.isRunning(),
          ended: contest.isEnded()
        } : null,
        judge_state: judge_state,
        languages: languages,
        submitUrl: contest ? 
          syzoj.utils.makeUrl(['problem', problem.id, 'submit'], { contest_id: contest.id }) :
          syzoj.utils.makeUrl(['problem', problem.id, 'submit'])
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取题目详情失败',
      error: e.message
    });
  }
});

// 获取题目统计信息
app.get('/api/v2/problems/:id/statistics', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const type = req.query.type || 'fastest'; // fastest, shortest, earliest

    const problem = await Problem.findById(id);
    if (!problem) {
      return res.send({
        success: false,
        message: '无此题目。'
      });
    }

    if (!await problem.isAllowedUseBy(res.locals.user)) {
      return res.send({
        success: false,
        message: '您没有权限访问此题目。'
      });
    }

    let orderBy = {};
    switch (type) {
      case 'fastest':
        orderBy = { total_time: 'ASC' };
        break;
      case 'shortest':
        orderBy = { code_length: 'ASC' };
        break;
      case 'earliest':
        orderBy = { submit_time: 'ASC' };
        break;
      default:
        orderBy = { total_time: 'ASC' };
    }

    const statistics = await JudgeState.find({
      where: {
        problem_id: id,
        type: 0,
        status: 'Accepted'
      },
      order: orderBy,
      take: 10
    });

    // 加载用户信息
    await statistics.forEachAsync(async judgeState => {
      await judgeState.loadRelationships();
    });

    res.send({
      success: true,
      data: {
        type: type,
        statistics: statistics.map(js => ({
          id: js.id,
          user: {
            id: js.user.id,
            username: js.user.username
          },
          total_time: js.total_time,
          max_memory: js.max_memory,
          code_length: js.code_length,
          language: js.language,
          submit_time: js.submit_time,
          url: syzoj.utils.makeUrl(['submission', js.id])
        }))
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取题目统计失败',
      error: e.message
    });
  }
});

// 获取题目标签列表
app.get('/api/v2/problems/tags', async (req, res) => {
  try {
    const tags = await ProblemTag.find({
      order: { name: 'ASC' }
    });

    res.send({
      success: true,
      data: {
        tags: tags.map(tag => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          url: syzoj.utils.makeUrl(['problems', 'tag', tag.id])
        }))
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取标签列表失败',
      error: e.message
    });
  }
});
