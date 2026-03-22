import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

const PLATFORM_ASPECT_RATIOS: Record<string, string> = {
  instagram: '1:1',
  facebook: '1:1',
  x: '16:9',
  twitter: '16:9',
  linkedin: '1:1',
  pinterest: '2:3',
  tiktok: '9:16',
  youtube: '16:9',
  threads: '1:1',
  bluesky: '16:9',
};

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
                    When using Gemini, aspect ratio is automatically set based on the target platform.
                    You can also override it with the aspectRatio parameter.
      `,
      inputSchema: z.object({
        prompt: z.string(),
        provider: z
          .enum(['dalle', 'gemini'])
          .optional()
          .describe(
            'Image generation provider. "dalle" for DALL-E 3, "gemini" for Gemini Nano Banana Pro. If not specified, uses IMAGE_GENERATION_PROVIDER env var or defaults to "dalle".'
          ),
        platform: z
          .string()
          .optional()
          .describe(
            'Target platform identifier (e.g. "instagram", "facebook", "x", "linkedin", "pinterest", "tiktok", "youtube", "threads", "bluesky"). Used to auto-select the best aspect ratio for the channel.'
          ),
        aspectRatio: z
          .enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
          .optional()
          .describe(
            'Override aspect ratio. If not set, derived from platform. Defaults to 1:1.'
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

        const aspectRatio =
          context.aspectRatio ||
          (context.platform
            ? PLATFORM_ASPECT_RATIOS[context.platform.toLowerCase()]
            : undefined);

        const image = await this._mediaService.generateImage(
          context.prompt,
          org,
          false,
          context.provider,
          aspectRatio
        );

        const file = await this.storage.uploadSimple(
          'data:image/png;base64,' + image
        );

        return this._mediaService.saveFile(org.id, file.split('/').pop(), file);
      },
    });
  }
}
