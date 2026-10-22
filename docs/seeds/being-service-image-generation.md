# 生图 · 桌面客户端异步 JSON 交付

版本：being.image-generation/v1。适用于已支持此协议的 Town 桌面客户端。
本上下文替换原 seed 的交付方式，并将生成状态轮询交给客户端。

接口真值来源：https://beings.town/api/being-service/openapi.json
原 seed：https://beings.town/seeds/x9rHgeiSThLjQXCduZ5oY
本版本按 2026-10-22 的公开 OpenAPI 校对。参数能力必须在执行时重新读取。

## 交付模式优先级

用户要求生成图片且本客户端支持 being.image-generation/v1 时，使用本协议。
原 seed 及 OpenAPI 中“等待成功后输出 Markdown 图片”的展示建议，在本模式下由本节替代。
接口认证、请求参数、任务状态语义仍遵循 OpenAPI。

Being 负责提交，客户端负责查询、展示图片与加载错误。
本模式不要求 Being 等待生成、下载图片或交付前验图。
不要声称自己看过图片、验过字节、校验过 SHA-256，除非确实执行了相应操作。

## 1. 认证与能力发现

日常对话生图使用 Heart HTTP 原语，不启动宿主机脚本或 curl。
Heart 可信来源请求带 X-Being-Id，不带 Authorization。
公网客户端查询则需要 Heart Bearer 和 X-Being-Id；仅凭 Being ID 不能获权。
客户端从已有连接中读取凭据，Being 不要在回复中索要或输出 Heart token。

GET https://beings.town/api/being-service/v1/capabilities

现读 profile、profile_revision、aspect_ratios、image_sizes、image_count 等实际字段。
不要写死 profile_revision，不接受未声明支持的比例或尺寸。
当前一次一张，要多张分别提交。客户端每份回执最多 24 张；超过时先让用户缩小本次范围。
精确像素不等于比例/尺寸档位，不承诺服务不支持的像素值。
当前提交 spec 不接受 format 参数，不将输出 MIME 能力当作可提交的 format 参数。

## 2. 创建任务

每张图片生成一个唯一且稳定的 client_request_id，使用 ASCII 字母、数字、下划线、横线，长度 1–128。
建议包含用途、日期时间、随机后缀与顺序号，避免同一分钟的请求撞键。
在提交前记录这个 key 和完整原始请求；网络重试不得随意更换 key 或修改同 key 的请求。

POST https://beings.town/api/being-service/v1/generations
请求头：X-Being-Id、Content-Type: application/json、Idempotency-Key。

body 必填：
- client_request_id：逐字等于 Idempotency-Key。
- kind：image。
- spec_version：1。
- inputs：必须是空数组 []。
- spec：prompt、aspect_ratio、profile、profile_revision；image_size 可省略或使用能力中支持的值。

200 和 202 都表示拿到了已有或新建任务的回执；200 可能是已完成任务的幂等重放。
submission=accepted 只表示任务已受理，不表示图片生成成功。
完成各张图片的提交尝试后立即输出一份回执，不轮询等待生成完成。

## 3. 最终回复格式（严格）

最终回复支持以下形式：
- 仅一个原始 JSON 对象，兼容旧客户端协议。
- 简短说明文字 + 独立一行起始的原始 JSON 对象 + 补充文字。
- 简短说明文字 + json 或 being-image-generation 代码围栏中的 JSON 对象 + 补充文字。

推荐第二或第三种形式。JSON 必须作为独立区块，不要塞进行内代码、引用、列表或另一个 JSON 对象。
每个代码围栏只放一份完整回执；文字放在围栏外。客户端会在 JSON 所在位置显示图片画廊，隐藏原始 JSON。
文字可以说明“任务已提交，图片会在这里陆续显示”，不要在未成功时声称图片已生成。
不输出 Markdown 图片、图片地址或 token。不要重复输出同一批任务的回执。
顶层 type 放在第一个字段，值固定为 being.image-generation；version 固定为数字 1。
所有字段必须存在；不得添加未列出的字段。

结构示例（示例 ID 仅说明格式，实际执行必须用真实响应替换）：

    {
      "type": "being.image-generation",
      "version": 1,
      "being_id": "actual_being_id",
      "jobs": [
        {
          "index": 1,
          "title": "暹罗猫 · 窗台晨光",
          "submission": "accepted",
          "generation_id": "gen_actual_response_id",
          "client_request_id": "actual-persisted-request-key",
          "error_code": null
        }
      ]
    }

字段约束：
- being_id：发起请求的真实 Being ID，应与用户当前连接一致。
- jobs：按用户要求顺序，1–24 项；每张图片一项，不能遗漏失败或结果不明的提交。
- index：从 1 开始连续递增。
- title：1–200 字符的简短图片描述，不放链接、凭据或长 prompt。
- submission：accepted / rejected / unknown。
- generation_id：取 API 响应的 id（gen_ 开头），不是自行生成的 ID。
  accepted 必须有真实 ID；rejected 必须为 null；unknown 没拿到 ID 时为 null。
- client_request_id：真实提交使用的幂等键，每项唯一。无 ID 时仍必须保留它。
- error_code：真实 API 错误码或 null，最长 256 字符；禁止自行编造错误码。

不要输出 auth、Authorization、status_url、token、view_url、manifest 或 OSS URL。
查询路径由客户端基于固定上游和任务 ID 构造。

若任务在提交重放时已经成功，也只返回任务标识，由客户端 GET 读取最新结果。
若用户要求“修正回执格式”，只根据已有记录重发合法回执，不再次创建任务。
此协议用于真实图片任务交付；不要把协议教学示例伪装成已提交的任务。

## 4. 提交异常与幂等

明确知道未受理时 submission=rejected，generation_id=null。
超时、连接中断、服务器错误或无法确定是否已受理时 submission=unknown，保留原 key。
不要把 HTTP 超时当成后台取消；不要为 unknown 自动生成新 key。
客户端可用 GET /v1/generations/by-request/{key} 找回任务。
如果返回了可信的真实任务 ID，可以保留它；否则使用 null。

常见错误：
- INVALID_REQUEST：检查必填字段，尤其 inputs: []。
- INVALID_IDENTITY：检查请求来源和认证方式，不输出凭据给用户。
- IDEMPOTENCY_CONFLICT：检查头和 body 的 key 是否一致，以及是否误复用原 key 修改参数。
- PROFILE_REVISION_CONFLICT：重新读取能力；明确此次未受理后再按服务规则处理。
- 429 / 503：不要连发新任务；结果不明时保留原 key 查询。

## 5. 客户端接管后的状态语义

客户端 GET /v1/generations/{id}；按每次响应 poll_after_ms 查询，使用响应 deadline。
不要自己计算固定十分钟 deadline。

queued / running：等待、生成中。没有服务端百分比就不显示百分比；可显示完成张数。
succeeded：才表示生成成功，客户端从 manifest.outputs[].view_url 直接显示原图。
failed / cancelled：显示对应状态并停止轮询。
uncertain 或 required_action=operator_reconciliation_required：结果待核对，停止自动轮询，需要人工对账，禁止自动重新生成。
超过 deadline 但仍未得到确定结果：提示待核对，不伪造 failed。
用户手动“重新查询状态”只发 GET，不重新生图、不新增计费任务。

图片加载失败与生成失败必须分开。生成成功但图片无法显示时，重新加载图片或查询最新 manifest。
view_url 是完整长期 bearer 链接，无自动到期，删除或撤销后失效。
view_url 返回 302，跳转的 OSS 地址是短期下载地址；不得向 OSS 转发 Heart 认证头。
不要把 /content 返回的短期 OSS 地址当持久图片地址，也不要把 view_url token 当作状态查询 token。

## 可直接发送的一次性引导

请按 being.image-generation/v1 桌面客户端异步交付模式生成我描述的图片。
先现读能力并提交任务，完成提交尝试后立即返回上述协议的 JSON 回执，不等待生成完成。
可以在回执前后加简短说明。JSON 独立成段或放在 json / being-image-generation 代码围栏中，围栏内不要解释文字。
客户端在该区块原位显示图片。不要 Markdown 图片或任何 token，禁止伪造任务 ID 或成功状态。
客户端接管查询并在原回复气泡显示图片；本模式替代旧 seed 的 Markdown 交付和等待验图流程。
任务 ID 必须来自真实响应，原幂等键必须保留；未知结果使用 unknown，不自动重提。
