import { z } from 'zod';
import { createArticleSchema } from '../middleware/dataValidation/schemas'; // Asegúrate de importar el esquema adecuado

export type createArticleType = z.infer<typeof createArticleSchema>;

export interface articlesWriter {
  username: string;
  name: string;
  lastname: string;
}
export interface returnArticles extends articlesWriter {
    id_article: number;
    id_writer: number;
    title?: string| null;
    date: Date;
    views: number;
    image_url: string;
    text: string;
  }

  export interface article_has_categories {
    category: {cat_name:string};
  }
  export interface returnArticlesCategory extends returnArticles {
    article_has_categories: article_has_categories[]
  }

  // export interface returnArticles {
  //   id_article: number;
  //   id_writer: number;
  //   title?: string| null;
  //   date: Date;
  //   views: number;
  //   image_url: string;
  //   text: string;
  //   username: string;
  //   name: string;
  //   lastname: string;
  // }
