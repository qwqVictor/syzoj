// API v2 - 系统配置相关接口
// 获取语言配置、评测状态、站点信息等

// 获取编程语言列表
app.get('/api/v2/config/languages', async (req, res) => {
  try {
    res.send({
      success: true,
      data: {
        languages: syzoj.languages,
        enabled_languages: syzoj.config.enabled_languages,
        filter_enabled_languages: syzoj.config.filter_enabled_languages
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取语言配置失败',
      error: e.message
    });
  }
});

// 获取评测状态列表
app.get('/api/v2/config/judge-status', async (req, res) => {
  try {
    // 从util.ejs或相关模板中获取状态图标配置
    const statusIcons = {
      'Accepted': 'checkmark',
      'Wrong Answer': 'remove',
      'Runtime Error': 'bomb',
      'Time Limit Exceeded': 'clock',
      'Memory Limit Exceeded': 'disk',
      'Compile Error': 'code',
      'System Error': 'server',
      'Canceled': 'ban',
      'Unknown': 'question',
      'Ignored': 'eye slash',
      'Waiting': 'hourglass',
      'Pending': 'hourglass',
      'Running': 'circle notched',
      'Compiling': 'circle notched',
      'Partially Correct': 'minus circle'
    };

    const hiddenStatus = ['Unknown', 'Ignored'];

    res.send({
      success: true,
      data: {
        statusList: Object.keys(statusIcons).filter(status => !hiddenStatus.includes(status)),
        icons: statusIcons,
        hiddenStatus: hiddenStatus
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取评测状态失败',
      error: e.message
    });
  }
});

// 获取站点基本信息
app.get('/api/v2/config/site-info', async (req, res) => {
  try {
    const responseData = {
      title: syzoj.config.title,
      current_user: null
    };

    // 如果用户已登录，返回基本用户信息
    if (res.locals.user) {
      responseData.current_user = {
        id: res.locals.user.id,
        username: res.locals.user.username,
        is_admin: res.locals.user.is_admin,
        rating: res.locals.user.rating,
        nameplate: res.locals.user.nameplate
      };
    }

    res.send({
      success: true,
      data: responseData
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取站点信息失败',
      error: e.message
    });
  }
});

// 获取VJudge语言配置（如果启用）
app.get('/api/v2/config/vjudge-languages', async (req, res) => {
  try {
    const vjudge = syzoj.lib('vjudge');
    
    res.send({
      success: true,
      data: {
        vjudge_languages: vjudge ? vjudge.languages : {}
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取VJudge语言配置失败',
      error: e.message
    });
  }
});

// 获取系统统计信息（公开信息）
app.get('/api/v2/config/statistics', async (req, res) => {
  try {
    let User = syzoj.model('user');
    let Problem = syzoj.model('problem');
    let JudgeState = syzoj.model('judge_state');

    const [userCount, problemCount, submissionCount] = await Promise.all([
      User.count(),
      Problem.count({ where: { is_public: true } }),
      JudgeState.count()
    ]);

    res.send({
      success: true,
      data: {
        user_count: userCount,
        problem_count: problemCount,
        submission_count: submissionCount
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.send({
      success: false,
      message: '获取系统统计失败',
      error: e.message
    });
  }
});
