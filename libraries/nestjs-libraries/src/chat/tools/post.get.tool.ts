// CRAFTBE: przeniesione z gałęzi craftbe-artemis (Mastra 0.20) na API Mastra 1.x.
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import dayjs from 'dayjs';

@Injectable()
export class PostGetTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postGetTool';

  run() {
    return createTool({
      id: 'postGetTool',
      mcp: {
        annotations: {
          title: 'Get Post',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
Return the full details of one existing post (scheduled, draft, published or failed): every item of the thread or every comment, its media, the provider settings, the state and - for a published post - the URL it was released at.
Find the post first with postsListTool and pass its "id".
Use it before postEditTool so the edit starts from the current content.
`,
      inputSchema: z.object({
        id: z.string().describe('The "id" of the post (from postsListTool)'),
      }),
      outputSchema: z.object({
        output: z
          .object({
            id: z.string(),
            group: z.string(),
            publishDate: z.string().describe('UTC time'),
            state: z.string().describe('QUEUE, DRAFT, PUBLISHED or ERROR'),
            editable: z
              .boolean()
              .describe('Only QUEUE and DRAFT posts can be edited with postEditTool'),
            releaseURL: z.string().optional(),
            error: z.string().optional().describe('Why publishing failed (ERROR state)'),
            integration: z.object({
              id: z.string(),
              name: z.string(),
              platform: z.string(),
            }),
            settings: z.record(z.string(), z.any()),
            postsAndComments: z.array(
              z.object({
                id: z.string(),
                content: z.string().describe('HTML'),
                attachments: z.array(
                  z.object({ path: z.string(), alt: z.string().optional() })
                ),
              })
            ),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        try {
          const post: any = await this._postsService.getPost(
            organizationId,
            inputData.id
          );
          const first = post.posts[0];

          return {
            output: {
              id: first.id,
              group: post.group,
              publishDate: dayjs(first.publishDate).toISOString(),
              state: first.state,
              editable: first.state === 'QUEUE' || first.state === 'DRAFT',
              ...(first.releaseURL ? { releaseURL: first.releaseURL } : {}),
              ...(first.error ? { error: String(first.error) } : {}),
              integration: {
                id: post.integration,
                name: first.integration?.name || '',
                platform: first.integration?.providerIdentifier || '',
              },
              settings: post.settings || {},
              postsAndComments: post.posts.map((p: any) => ({
                id: p.id,
                content: p.content || '',
                attachments: (p.image || []).map((m: any) => ({
                  path: m.path,
                  ...(m.alt ? { alt: m.alt } : {}),
                })),
              })),
            },
          };
        } catch (err: any) {
          return { output: { errors: err?.message || 'Post not found' } };
        }
      },
    });
  }
}
