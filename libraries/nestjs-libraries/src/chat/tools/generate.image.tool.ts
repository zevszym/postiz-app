import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class GenerateImageTool implements AgentToolInterface {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}
  name = 'generateImageTool';

  run() {
    return createTool({
      id: 'generateImageTool',
      description: `Generate image to use in a post,
                    in case the user specified a platform that requires attachment and attachment was not provided,
                    ask if they want to generate a picture of a video.
                    Supports DALL-E 3 (default) and Gemini Nano Banana Pro (set provider to "gemini").
                    The provider can also be configured globally via IMAGE_GENERATION_PROVIDER env var.
      `,
      inputSchema: z.object({
        prompt: z.string(),
        provider: z
          .enum(['dalle', 'gemini'])
          .optional()
          .describe(
            'Image generation provider. "dalle" for DALL-E 3, "gemini" for Gemini Nano Banana Pro. If not specified, uses IMAGE_GENERATION_PROVIDER env var or defaults to "dalle".'
          ),
      }),
      outputSchema: z.object({
        id: z.string(),
        path: z.string(),
      }),
      execute: async (args, options) => {
        const { context, runtimeContext } = args;
        checkAuth(args, options);
        // @ts-ignore
        const org = JSON.parse(runtimeContext.get('organization') as string);
        const image = await this._mediaService.generateImage(
          context.prompt,
          org,
          false,
          context.provider
        );

        const file = await this.storage.uploadSimple(
          'data:image/png;base64,' + image
        );

        return this._mediaService.saveFile(org.id, file.split('/').pop(), file);
      },
    });
  }
}
