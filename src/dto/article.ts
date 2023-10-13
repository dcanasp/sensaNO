import { z } from 'zod';
import { createArticleSchema,addCategoriesSchema } from '../middleware/dataValidation/schemas'; // Asegúrate de importar el esquema adecuado
import {databaseUser} from './user'

export type createArticleType = z.infer<typeof createArticleSchema>;
export type addCategoriesType = z.infer<typeof addCategoriesSchema>;

export interface articlesWriter {
  username: string;
  name: string;
  lastname: string;
}
export interface returnArticlesImage extends returnArticles{
  profile_image: string;
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

  export interface returnArticlesFeed extends returnArticles {
    article_has_categories: article_has_categories[];
    saved:boolean;
    savedUsername?: string|undefined;
    savedId?: number|undefined;
    
  }


  export interface article_has_categories {
    category: {cat_name:string};
  }
  export interface article_has_categories_id{
    categories_id_categories: number;
  }
  
  export interface returnArticlesCategory_id extends returnArticles {
    article_has_categories: article_has_categories_id[];
  }

  export interface returnArticlesCategory extends returnArticles {
    article_has_categories: article_has_categories[]
  }

  export interface createArticleUserType extends returnArticles{
    writer: databaseUser
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
