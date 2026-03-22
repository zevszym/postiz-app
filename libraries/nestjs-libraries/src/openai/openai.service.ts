import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { shuffle } from 'lodash';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

@Injectable()
export class OpenaiService {
  async generateImage(prompt: string, isUrl: boolean, isVertical = false) {
    const generate = (
      await openai.images.generate({
        prompt,
        response_format: isUrl ? 'url' : 'b64_json',
        model: 'dall-e-3',
        ...(isVertical ? { size: '1024x1792' } : {}),
      })
    ).data[0];

    return isUrl ? generate.url : generate.b64_json;
  }

  async generateImageGemini(
    prompt: string,
    options?: {
      aspectRatio?: string;
      imageSize?: string;
      model?: string;
      thinkingLevel?: string;
      useGoogleSearch?: boolean;
      useImageSearch?: boolean;
      referenceImages?: Array<{ mimeType: string; data: string }>;
    }
  ): Promise<{ imageBase64: string; thoughts?: string; textResponse?: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelId = options?.model || process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';

    // Build contents: text prompt + optional reference images
    const contents: any[] = [prompt];
    if (options?.referenceImages?.length) {
      for (const ref of options.referenceImages) {
        contents.push({
          inlineData: { mimeType: ref.mimeType, data: ref.data },
        });
      }
    }

    // Build tools config for search grounding
    let tools: any[] | undefined;
    if (options?.useImageSearch) {
      tools = [{
        googleSearch: {
          searchTypes: { webSearch: {}, imageSearch: {} },
        },
      }];
    } else if (options?.useGoogleSearch) {
      tools = [{ googleSearch: {} }];
    }

    // Only include thinkingConfig when explicitly requested — let API use defaults otherwise
    const thinkingConfig =
      options?.thinkingLevel && modelId.startsWith('gemini-3')
        ? { thinkingConfig: { thinkingLevel: options.thinkingLevel as any } }
        : {};

    const response = await ai.models.generateContent({
      model: modelId,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...thinkingConfig,
        imageConfig: {
          aspectRatio: options?.aspectRatio || '1:1',
          imageSize: options?.imageSize || process.env.GEMINI_IMAGE_SIZE || '1K',
        },
        ...(tools ? { tools } : {}),
      },
    });

    // Parse response parts
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts?.length) {
      throw new Error('Gemini returned no response');
    }

    let imageBase64: string | undefined;
    let thoughts: string | undefined;
    let textResponse: string | undefined;

    for (const part of parts) {
      if ((part as any).thought && (part as any).text) {
        thoughts = (thoughts ? thoughts + '\n' : '') + (part as any).text;
      } else if ((part as any).inlineData?.data) {
        imageBase64 = (part as any).inlineData.data;
      } else if ((part as any).text) {
        textResponse = (textResponse ? textResponse + '\n' : '') + (part as any).text;
      }
    }

    if (!imageBase64) {
      throw new Error('Gemini returned no image data');
    }

    return { imageBase64, thoughts, textResponse };
  }

  async editImageGemini(
    instruction: string,
    sourceImageBase64: string,
    sourceMimeType: string,
    options?: {
      aspectRatio?: string;
      imageSize?: string;
      model?: string;
      thinkingLevel?: string;
    }
  ): Promise<{ imageBase64: string; thoughts?: string; textResponse?: string }> {
    return this.generateImageGemini(instruction, {
      ...options,
      thinkingLevel: options?.thinkingLevel,
      referenceImages: [{ mimeType: sourceMimeType, data: sourceImageBase64 }],
    });
  }

  async fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') || 'image/png';
    return { data: buffer.toString('base64'), mimeType };
  }

  async generatePromptForPicture(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(PicturePrompt, 'picturePrompt'),
        })
      ).choices[0].message.parsed?.prompt || ''
    );
  }

  async generateVoiceFromText(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(VoicePrompt, 'voice'),
        })
      ).choices[0].message.parsed?.voice || ''
    );
  }

  async generatePosts(content: string) {
    const posts = (
      await Promise.all([
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              content
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  async extractWebsiteText(content: string) {
    const websiteContent = await openai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: 'gpt-4.1',
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePosts(articleContent!);
  }

  async separatePosts(content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
                len - 10
              } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
            },
            {
              role: 'user',
              content: content,
            },
          ],
          response_format: zodResponseFormat(
            SeparatePostsPrompt,
            'separatePosts'
          ),
        })
      ).choices[0].message.parsed?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await openai.chat.completions.parse({
                    model: 'gpt-4.1',
                    messages: [
                      {
                        role: 'system',
                        content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                      },
                      {
                        role: 'user',
                        content: post,
                      },
                    ],
                    response_format: zodResponseFormat(
                      SeparatePostPrompt,
                      'separatePost'
                    ),
                  })
                ).choices[0].message.parsed?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(text: string) {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
        const parse =
          (
            await openai.chat.completions.parse({
              model: 'gpt-4.1',
              messages: [
                {
                  role: 'system',
                  content: message,
                },
                {
                  role: 'user',
                  content: text,
                },
              ],
              response_format: zodResponseFormat(
                z.object({
                  slides: z
                    .array(
                      z.object({
                        imagePrompt: z.string(),
                        voiceText: z.string(),
                      })
                    )
                    .describe('an array of slides'),
                }),
                'slides'
              ),
            })
          ).choices[0].message.parsed?.slides || [];

        return parse;
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }
}
