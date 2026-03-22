import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { resolveAspectRatio } from './platform.constants';

@Injectable()
export class GenerateImageTool implements AgentToolInterface {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}
  name = 'generateImageTool';

  run() {
    return createTool({
      id: 'generateImageTool',
      description: `Generate an AI image for any purpose — social media posts, knowledge base, reference material, product research, analysis, or standalone use.
                    The image is saved to the media library and can be attached to a post later, or kept as standalone.
                    Supports DALL-E 3 and Gemini (Nano Banana, Nano Banana 2, Nano Banana Pro).
                    Gemini features: thinking mode for best quality, Google Search grounding for real products/brands, reference images for consistency.
                    When any Gemini-specific option is used, provider is automatically set to "gemini".
      `,
      inputSchema: z.object({
        prompt: z.string().describe('Description of the image to generate'),
        provider: z
          .enum(['dalle', 'gemini'])
          .optional()
          .describe('Provider. Default: env IMAGE_GENERATION_PROVIDER or "dalle".'),
        platform: z
          .string()
          .optional()
          .describe('Target platform for auto aspect ratio (instagram, facebook, x, linkedin, pinterest, tiktok, youtube, threads, bluesky).'),
        aspectRatio: z
          .enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
          .optional()
          .describe('Override aspect ratio. If not set, derived from platform. Defaults to 1:1.'),
        model: z
          .enum([
            'gemini-2.5-flash-image',
            'gemini-3.1-flash-image-preview',
            'gemini-3-pro-image-preview',
          ])
          .optional()
          .describe('Gemini model. "gemini-2.5-flash-image" = Nano Banana (fast/cheap), "gemini-3.1-flash-image-preview" = Nano Banana 2 (balanced, supports image search), "gemini-3-pro-image-preview" = Nano Banana Pro (highest quality). Default from env or Pro.'),
        thinkingLevel: z
          .enum(['None', 'Low', 'Medium', 'High'])
          .optional()
          .describe('Thinking depth for Gemini. Higher = better quality, slower. Default: "High".'),
        useGoogleSearch: z
          .boolean()
          .optional()
          .describe('Enable Google Search grounding. Model searches the web for real product info, trends, etc. before generating. Great for e-commerce. Default: false.'),
        useImageSearch: z
          .boolean()
          .optional()
          .describe('Enable Google Image Search grounding (auto-switches to Nano Banana 2 model). Model uses Google Image Search results as visual context. Default: false.'),
        referenceImageIds: z
          .array(z.string())
          .max(14)
          .optional()
          .describe('Media library IDs of reference images (up to 14). Model uses these for visual consistency — e.g., same product in different settings.'),
      }),
      outputSchema: z.object({
        id: z.string(),
        path: z.string(),
        thoughts: z.string().optional(),
        textResponse: z.string().optional(),
      }),
      execute: async (args, options) => {
        const { context, runtimeContext } = args;
        checkAuth(args, options);
        // @ts-ignore
        const org = JSON.parse(runtimeContext.get('organization') as string);

        const aspectRatio = resolveAspectRatio(context.aspectRatio, context.platform);

        // Auto-force gemini provider when Gemini-specific options are used
        const hasGeminiOptions = context.model || context.thinkingLevel ||
          context.useGoogleSearch || context.useImageSearch || context.referenceImageIds?.length;
        const provider = hasGeminiOptions ? 'gemini' : context.provider;

        // Auto-switch model for image search
        let model = context.model;
        if (context.useImageSearch && model !== 'gemini-3.1-flash-image-preview') {
          model = 'gemini-3.1-flash-image-preview';
        }

        // Resolve reference image URLs from media library IDs
        let referenceImageUrls: string[] | undefined;
        if (context.referenceImageIds?.length) {
          const mediaRecords = await Promise.all(
            context.referenceImageIds.map((id: string) =>
              this._mediaService.getMediaById(id)
            )
          );
          referenceImageUrls = mediaRecords
            .filter(Boolean)
            .map((m: any) => m.path);
        }

        const useGemini = provider === 'gemini' || (provider || process.env.IMAGE_GENERATION_PROVIDER || 'dalle').toLowerCase() === 'gemini';

        const image = await this._mediaService.generateImage(
          context.prompt,
          org,
          false,
          provider,
          aspectRatio,
          useGemini
            ? {
                model,
                thinkingLevel: context.thinkingLevel,
                useGoogleSearch: context.useGoogleSearch,
                useImageSearch: context.useImageSearch,
                referenceImageUrls,
              }
            : undefined
        );

        if (!image) {
          throw new Error('Image generation returned no data');
        }

        const file = await this.storage.uploadSimple(
          'data:image/png;base64,' + image
        );

        const saved = await this._mediaService.saveFile(org.id, file.split('/').pop(), file);
        return { id: saved.id, path: saved.path };
      },
    });
  }
}
