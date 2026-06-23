// 非対話: 指定スプライトを書き出す
// 入力テキスト /tmp/ut_export.txt :
//   1行目: 出力モード+ディレクトリ  例 "GIF\t/path/to/faces"  または "PNG\t/path/to/bubbles"
//   2行目以降: スプライト名 (1行1個)
// ExportSpritesAsGIF.csx (CST1229) のフレーム処理を流用
using System;
using System.Collections.Generic;
using System.IO;
using UndertaleModLib.Models;
using UndertaleModLib.Util;
using ImageMagick;

EnsureDataLoaded();

string[] lines = File.ReadAllLines("/tmp/ut_export.txt");
string[] hdr = lines[0].Split('\t');
string mode = hdr[0].Trim();
string outDir = hdr[1].Trim();
Directory.CreateDirectory(outDir);

Dictionary<string, UndertaleSprite> spriteMap = new Dictionary<string, UndertaleSprite>();
foreach (UndertaleSprite s in Data.Sprites)
    if (s != null && s.Name != null) spriteMap[s.Name.Content] = s;

TextureWorker worker = new TextureWorker();

void ExportGif(UndertaleSprite sprite, string folder)
{
    using (MagickImageCollection gif = new MagickImageCollection())
    {
        bool any = false;
        for (int i = 0; i < sprite.Textures.Count; i++)
        {
            if (sprite.Textures[i] != null && sprite.Textures[i].Texture != null)
            {
                IMagickImage<byte> image = worker.GetTextureFor(sprite.Textures[i].Texture, sprite.Name.Content + " (frame " + i + ")", true);
                image.GifDisposeMethod = GifDisposeMethod.Previous;
                if (sprite.IsSpecialType && Data.IsGameMaker2())
                {
                    if (sprite.GMS2PlaybackSpeed == 0f) image.AnimationDelay = 10;
                    else if (sprite.GMS2PlaybackSpeedType == AnimSpeedType.FramesPerGameFrame)
                        image.AnimationDelay = (uint)Math.Max((int)(Math.Round(100f / (sprite.GMS2PlaybackSpeed * Data.GeneralInfo.GMS2FPS))), 1);
                    else image.AnimationDelay = (uint)Math.Max((int)(Math.Round(100 / sprite.GMS2PlaybackSpeed)), 1);
                }
                else image.AnimationDelay = 3;
                gif.Add(image);
                any = true;
            }
        }
        if (!any) return;
        gif.Optimize();
        gif.Write(Path.Join(folder, sprite.Name.Content + ".gif"));
    }
}

void ExportPng0(UndertaleSprite sprite, string folder)
{
    if (sprite.Textures.Count == 0 || sprite.Textures[0] == null || sprite.Textures[0].Texture == null) return;
    worker.ExportAsPNG(sprite.Textures[0].Texture, Path.Join(folder, sprite.Name.Content + "_0.png"), null, true);
}

int ok = 0, miss = 0;
for (int li = 1; li < lines.Length; li++)
{
    string nm = lines[li].Trim();
    if (nm == "") continue;
    if (!spriteMap.ContainsKey(nm)) { Console.WriteLine("MISSING sprite: " + nm); miss++; continue; }
    if (mode == "PNG") ExportPng0(spriteMap[nm], outDir);
    else ExportGif(spriteMap[nm], outDir);
    ok++;
}
Console.WriteLine("exported: " + ok + ", missing: " + miss);
