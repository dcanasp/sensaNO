import "reflect-metadata";
import {injectable, inject} from 'tsyringe';
import {DatabaseService} from '../db/databaseService';
import {logger, permaLogger} from '../utils/logger';
import {createArticleType,returnArticles} from '../dto/article';
import {uploadToS3} from '../aws/addS3';
import {DatabaseErrors} from '../errors/database.errors';
import {UserService} from '../user/user.service';
import {Roles} from '../utils/roleDefinition';
import {resizeImages} from '../utils/resizeImages';
import {communityType, createCommunityType} from '../dto/community';
import {works} from '../utils/works';
import { json } from "stream/consumers";

@injectable()
export class CommunityService {
    private databaseService
    constructor(@inject(DatabaseService) databaseService : DatabaseService) {
        this.databaseService = databaseService.getClient()
    }

    public async findAll() {

        try{
            const comunidad = await this.databaseService.community.findMany({
                include:{
                    community_has_users:{
                        orderBy:{
                            community_id_community:"desc"
                        }
                },
                    community_has_categories:{
                        select:{
                            category:{
                                select:{
                                    id_category:true,
                                    cat_name:true
                                }
                            }
                        }
                    }
                }
              });

            if (!works(comunidad)) {
                throw new DatabaseErrors('no hay comunidades');
            }
            return comunidad;
        }catch{
            return;
        }
    }

    public async find(nombre:string) {

        try{
            const comunidad = await this.databaseService.community.findMany({
                where: {
                  OR: [
                    {
                      name: {
                        contains: nombre,
                        mode: 'insensitive',
                      }
                    },
                  ]
                },
                include:{
                    community_has_users:{
                    orderBy:{
                        community_id_community:"desc"
                    }
                },
                community_has_categories:{
                    select:{
                        category:{
                            select:{
                                id_category:true,
                                cat_name:true
                            }
                        }
                    }
                }}
              });
            if (!works(comunidad)) {
                throw new DatabaseErrors('no hay comunidad con ese nombre');
            }
            return comunidad
        }catch{
            return;
        }

    }

    public async getUsersCountFromCommunities(comunidad: communityType[]){
        try{
        const communitiesWithFollowerCount = await Promise.all(
            comunidad.map(async ({community_has_users,...community}) => {
                const followerCount = await this.databaseService.community_has_users.count({
                where: {
                    community_id_community: community.id_community
                }
                });
                return {
                    ...community,
                    followerCount
                };
            })
            );

            if (!works(communitiesWithFollowerCount) ) {
                throw new DatabaseErrors('fallo sacar usuarios de la comunidad');
            }
            return communitiesWithFollowerCount;
        }catch{
            return ;
        }
    }

    public async relatedWritter(articleId:number,communityId:number,weekAgo:Date) {
        try{
        const escritorId = (await this.databaseService.article.findMany({ 
            where:{id_article:articleId},  
            select:{ id_writer:true},
        }))[0].id_writer
        
        
        //articulos del mismo autor en la misma coumidad
        const relatedArticlesByWritter = await this.databaseService.community.findUnique({
            where:{id_community:communityId},
 
            select:{ 
                community_has_articles:{

                where:{article:{id_writer:escritorId,date:{gte: weekAgo}}},
                include:{article:{include:{writer:{select:{name:true,lastname:true,username:true}}}
                        
            }},
                orderBy:{article_id_community:"desc"}}
                
            }
        });
        if(!(relatedArticlesByWritter)){
            throw new DatabaseErrors("no encontro articulos de ese autor")
        }
        const flatArticlesByWritter: returnArticles[] = relatedArticlesByWritter?.community_has_articles.flatMap(communityArticle => {
            const {writer,...article} = communityArticle.article;
            return {
                ...article,...writer
            };
          });
        
        
        return flatArticlesByWritter;
        }catch{
            return ;
        }
    }


    public async relatedCategories(articleId:number,communityId:number,weekAgo:Date) {
    try{

        const articleCategories = await this.databaseService.article.findUnique({
            where: { id_article: articleId },
            select: {
              article_has_categories: {
                select: {
                  categories_id_categories: true,
                },
              },
            },
          });

        if (!(articleCategories)){
            throw new DatabaseErrors("fallo monumental, no encuentra categorias de un articulo")
        }
          const categoryIds = articleCategories.article_has_categories.map(
            (category) => category.categories_id_categories
          );
          
          // Find articles with the same categories in the given community
          const relatedArticlesByCategories = await this.databaseService.community.findUnique({
            where: { id_community: communityId },
            select: {
              community_has_articles: {
                where: {
                  article: {
                    date:{
                        gte: weekAgo
                    },
                    article_has_categories: {
                      some: {
                        categories_id_categories: {
                          in: categoryIds,
                        },
                      },
                    },
                  },
                },
                include: {
                  article: {
                    include: {
                      writer: {
                        select: { name: true, lastname: true, username: true },
                      },
                    },
                  },
                },
                orderBy: { article_id_community: 'desc' },
              },
            },
          });
        if (!relatedArticlesByCategories){
            throw new DatabaseErrors("fallo monumental, no encuentra categorias de un articulo")
        }
        const flatArticlesByCategories: returnArticles[] = relatedArticlesByCategories.community_has_articles.flatMap(communityArticle => {
            const {writer,...article} = communityArticle.article;
            return {
                ...article,...writer
            };
          });
        return flatArticlesByCategories
    }catch{
        return ;
    }
    
    }
    public async feed(communityId:number,weekAgo:Date) {
        try{
            const idArticulosDeComunidad = await this.databaseService.community_has_articles.findMany({
                where:{
                    community_id_community: communityId,
                }
            });
            const categoriesNames = await this.databaseService.categories.findMany();
            const articles = [];
            for (const article of idArticulosDeComunidad){

                const articulosComunidad = await this.databaseService.article.findMany({
                    where:{
                        id_article:article.article_id_community,
                        date:{
                            gte:weekAgo,
                        }
                    },
                    include:{
                        writer: {
                            select: { name: true, lastname: true, username: true,profile_image:true },
                        },
                        article_has_categories:true
                    }

                }) 
                if (!articulosComunidad){
                    continue;
                }

                const categoriesNamesMap = new Map(
                    categoriesNames.map(({ id_category, cat_name }) => [id_category, cat_name])
                  );
                  
                  const modifiedArticles = articulosComunidad.map((article) => {
                    const { writer, article_has_categories, ...rest } = article;
                  
                    const modifiedCategories = article_has_categories.map((categoryRelation) => {
                      const categoryName = categoriesNamesMap.get(categoryRelation.categories_id_categories) || 'Unknown';
                      return {
                        categories_id_categories: categoryRelation.categories_id_categories,
                        category_name: categoryName,
                      };
                    });
                  
                    return {
                      ...rest,
                      ...writer,
                      article_has_categories: modifiedCategories,
                    };
                  });
                  
                if (!modifiedArticles||modifiedArticles.length===0){
                    continue;
                }
                articles.push(modifiedArticles)
                  
                  
                
            }
            
            const flatArticle: returnArticles[] = articles.flatMap( eachArticle =>{
                return [...eachArticle]
            })

            return flatArticle 

        }
        catch{
            return ;
        }
    }

  public async getCommunityById(communityId : number, userId : number) {
    try{

    const community = await this.databaseService.community.findFirst({
      where: {
          id_community: communityId
      },
      include:{community_has_categories:{
          select:{category:{select:{id_category:true, cat_name:true}}}
      },
      }
    });

    if (!community) {
      return {"err": 'La comunidad no existe'};
    }

    const membersCount = await this.databaseService.community_has_users.count({
      where: {
        community_id_community: communityId,
      },
    });

    const articlesCount = await this.databaseService.community_has_articles.count({
      where: {
        community_id_community: communityId,
      },
    });

    const isCreator = community.creator_id == userId;
    const isMember = await this.isMemberOfCommunity(userId, communityId);
    if (isMember || isCreator) {
              const articles = await this.databaseService.community_has_articles.findMany({
            where: {
                community_id_community: communityId,
            },
            select: {
                article: {
                    select: {
                        id_article: true,
                        title: true,
                        date: true,
                        image_url: true,
                        text: true,
                        writer: {
                            select: {
                                id_user: true,
                                username: true,
                            },
                        },
                    },
                },
                users: { // Usuario que posteó el artículo en la comunidad
                    select: {
                            id_user: true,
                            username: true,      
                            },
                        },
                },
            });

        return {
          ...community,
          isCreator,
          isMember,
          membersCount,
          articlesCount,
          articles,
        };
    }

    return {
      ...community,
      isCreator,
      isMember,
      membersCount,
      articlesCount,
    };
    }
    catch{
        return ;
    }

  }

  public async isMemberOfCommunity(userId: number, communityId: number) {
    const userMember = await this.databaseService.community_has_users.findFirst({
      where: {
        users_id_community: userId,
        community_id_community: communityId,
      },
    });
    return !!userMember;
  }

  public async createCommunity(body : createCommunityType) {
      try{
        
        let finalAvatarUrl= 'https://trunews.s3.us-east-2.amazonaws.com/profile/defaultProfile.jpg';
        if (body.avatar_url!=''){
            const urlAvatar = await this.addImageNew(body.avatar_url,body.avatar_extension,body.avatar_ancho,body.avatar_ratio,'avatar')
            if (! urlAvatar) {
                throw new DatabaseErrors('No se pudo crear avatar en s3.')
            }
            finalAvatarUrl = urlAvatar;
        }

        let finalBannerUrl= 'https://trunews.s3.us-east-2.amazonaws.com/community/banner/defaultBanner.jpg';
        if (body.banner_url!=''){
            const urlBanner = await this.addImageNew(body.banner_url,body.banner_extension,body.banner_ancho,body.banner_ratio,'banner')
            if (! urlBanner) {
                throw new DatabaseErrors('No se pudo crear banner en s3.')
            }
            finalBannerUrl = urlBanner;
        }
        const communityCreated = await this.databaseService.community.create({
          data: {
              name: body.name,
              description: body.description,
              creator_id: body.creator_id,
              date: body.date,
              avatar_url: finalAvatarUrl,//urlAvatar
              banner_url: finalBannerUrl,//urlBanner
          }
      })

    if (body.id_categories) {
        for (const category of body.id_categories) {
            await this.addCategoryToCommunity(communityCreated.id_community, category);
        }
    }

    if (!communityCreated){
        throw new DatabaseErrors('No se pudo crear la comunidad.')
    }
      this.joinCommunity(communityCreated.id_community, body.creator_id);
      return communityCreated
      }
      catch{
          return ;
      }
  }
  
  public async isCreator(communityId : number, userId : number) {
        const community = await this.databaseService.community.findFirst({
        where: {
                id_community: communityId
            },
        });
    
        if (!community) {
            return {"err": 'La comunidad no existe'};
        }
    
        return community.creator_id == userId;
    }

  public async updateCommunity(communityId : number, body : Partial<createCommunityType>) {
      try{
        const existingCommunity = await this.databaseService.community.findFirst({
          where: {
              id_community: communityId
          },
      });

      if (!existingCommunity) {
          throw new DatabaseErrors('La comunidad no existe');
      }
      //public async addImageUpdate(communityId:number,contenido: string, extension:string,subFolder:string) {
      const urlAvatar = await this.addImageUpdate(communityId,body.avatar_url,body.avatar_extension,'banner')
      if (! urlAvatar) {
          throw new DatabaseErrors('No se pudo crear avatar en s3.')
      }
      const urlBanner = await this.addImageUpdate(communityId,body.banner_url,body.banner_extension,'banner')
      if (! urlBanner) {
          throw new DatabaseErrors('No se pudo crear banner en s3.')
      }
      

      const communityUpdated = await this.databaseService.community.update({
          where: {
              id_community: communityId
          },
          data: {
              name: body.name || existingCommunity.name,
              description: body.description || existingCommunity.description,
              creator_id: body.creator_id || existingCommunity.creator_id,
              avatar_url: body.avatar_url || existingCommunity.avatar_url,
              banner_url: body.banner_url || existingCommunity.banner_url,
          }
      })

      if (!communityUpdated){
          throw new DatabaseErrors('No se pudo actualizar la comunidad.')
      }
      return communityUpdated
      }
      catch{
          return ;
      }
  }

  public async deleteCommunity(communityId : number) {
      try{
      const communityDeleted = await this.databaseService.community.delete({
          where: {
              id_community: communityId
          }
      })

      if (!communityDeleted){
          throw new DatabaseErrors('No se pudo eliminar la comunidad.')
      }
      return communityDeleted
      }
      catch{
          return ;
      }
  }

  public async getCommunityMembers(communityId : number) {
      return await this.databaseService.community_has_users.findMany({
          where: {
              community_id_community: communityId
          }
      });
  }

  public async countMembers(communityId : number) {
      return await this.databaseService.community_has_users.count({
          where: {
              community_id_community: communityId
          }
      });
  }

  public async joinCommunity(communityId : number, userId : number) {
      try{
      const communityJoined = await this.databaseService.community_has_users.create({
          data: {
              community_id_community: communityId,
              users_id_community: userId
          }
      })

      if (!communityJoined){
          throw new DatabaseErrors('No se pudo unir al usuario a la comunidad.')
      }
      return communityJoined;
      }
      catch{
          return ;
      }
  }

  public async leaveCommunity(communityId : number, userId : number) {
      try{
      const communityLeft = await this.databaseService.community_has_users.deleteMany({
          where: {
              community_id_community: communityId,
              users_id_community: userId
          }
      })

      if (!communityLeft){
          throw new DatabaseErrors('No se pudo eliminar al usuario como miembro de la comunidad.')
      }
      return communityLeft
      }
      catch{
          return ;
      }
  }

    public async addImageUpdate(communityId:number,contenido: string, extension:string='.png',subFolder:string) {
        try {
            const folder = `community/${subFolder}`;
            // const imageBuffer = contenido;
            const imageBuffer = Buffer.from(contenido.split(',')[1], 'base64');
            // debe ser un buffer el contenido
            
            const link = process.env.S3_url
            const file_name = (communityId + extension)
            
            // const resizedImageBuffer = await resizeImages(imageBuffer,ancho,ratio);

            const url = await uploadToS3(file_name, imageBuffer,folder) // body.contenido);
            if (! url) {
                throw new DatabaseErrors('no se pudo subir a s3');
            }
            // crear nuevo registro
            return `${link}${folder}/${file_name}`;
        } catch (error) {
            return;
        }
    }

    public async addImageNew(contenido: string, extension:string,ancho:number,ratio:string,subFolder:string) {
        try {
            const ultimo = await this.databaseService.community.findMany({
                orderBy: {
                    id_community: 'desc'
                },
                take: 1
            });
            const folder = `community/${subFolder}`;
            // const imageBuffer = contenido;
            const imageBuffer = Buffer.from(contenido.split(',')[1], 'base64');
            // debe ser un buffer el contenido
            let ultimo_usuario = (1).toString()
            if (ultimo[0]) {
                ultimo_usuario = (ultimo[0].id_community + 1).toString()
            }

            const link = process.env.S3_url
            const file_name = (ultimo_usuario + extension)
            console.log(file_name);
            const resizedImageBuffer = await resizeImages(imageBuffer,ancho,ratio);
            console.log("Img resized");
            const url = await uploadToS3(file_name, resizedImageBuffer,folder) // body.contenido);
            if (! url) {
                throw new DatabaseErrors('no se pudo subir a s3');
            }
            // crear nuevo registro
            return `${link}${folder}/${file_name}`;
        } catch (error) {
            return;
        }
    }

    public async getCommunityCategories(communityId : number) {
        try{
        const communityCategories = await this.databaseService.community_has_categories.findMany({
            where: {
                community_id_community: communityId
            },
            select: {
                categories_id_community: true
            }
        });

        if (!communityCategories){
            throw new DatabaseErrors('No se pudo encontrar las categorias de la comunidad.')
        }
        return communityCategories
        }
        catch{
            return ;
        }
    }

    public async addArticleToCommunity(communityId: number, articleId: number, userId: number) {
        try{

        const article = await this.databaseService.article.findUnique({
            where: { id_article: articleId },
            include: { article_has_categories: { include: { category: true } }},
            });

        const community = await this.databaseService.community.findUnique({
            where: { id_community: communityId },
            include: { community_has_categories: { include: { category: true } }},
        });

    
        if (!article || !community) {
            throw new DatabaseErrors('No se pudo encontrar el artículo o la comunidad.');
        }
        // console.log(article.article_has_categories)
        // console.log(community.community_has_categories)
        // Comprueba si hay al menos una categoría en común entre el artículo y la comunidad
        const commonCategories = article.article_has_categories.map(ac => ac.category.id_category)
            .filter(categoryId => community.community_has_categories.some(cc => cc.category.id_category === categoryId));
        if (commonCategories.length === 0) {
            return  ;
        }
    

        const crearArticulo =await this.databaseService.community_has_articles.create({
            data: {
                community_id_community: communityId,
                article_id_community: articleId,
                users_id_community: userId
            }
        });
        return {"succes":true}        
        }
        catch{
            return {"err":"ya existe el articulo en la comunidad"};
        }

    }
    

    public async addCategoryToCommunity(communityId : number, categoryId : number) {
        try{
        const communityCategory = await this.databaseService.community_has_categories.create({
            data: {
                community_id_community: communityId,
                categories_id_community: categoryId
            }
        });

        if (!communityCategory){
            throw new DatabaseErrors('No se pudo agregar la categoria a la comunidad.')
        }
        return communityCategory
        }
        catch{
            return ;
        }
    }

    public async removeArticle(communityId : number, articleId : number, userId : number) {
        try{
            const communityArticle = await this.databaseService.community_has_articles.deleteMany({
            where: {
                community_id_community: communityId,
                article_id_community: articleId,
                users_id_community: userId
            }
        });

        if (communityArticle.count === 0){
            return ;
        }
        return communityArticle
        }
        catch{
            return ;
        }
       }

       public async checkArticleToAdd(userId: number,communityId: number) {
        try{
            const article = await this.databaseService.article.findMany({
                where: { id_writer:userId },
                include: { 
                    writer:{select:{
                        username:true,
                        name:true,
                        lastname:true,
                    }},
                    article_has_categories: { select: { category: true } },
            },
            });
            
            const saved = await this.databaseService.saved.findMany({
                where: { id_user:userId },
                include: { 
                    article:{include:{

                            writer:{select:{
                                username:true,
                                name:true,
                                lastname:true,}},
                            article_has_categories: { select: { category: true } },
                            
                        },
                        

                    }
                
                },
            });

            
            if (!article && !saved) {
                throw new DatabaseErrors('No tiene nada escrito, ni guardado');
            }
            
            const isInCommunity = await this.databaseService.community_has_articles.findMany({
                where: {users_id_community:userId,community_id_community:communityId}
            });

            const filterArticle = article.filter((art) => {
                return !isInCommunity.some(commnunityArt => art.id_article === commnunityArt.article_id_community);
            });

            const filterSaved = saved.filter((sav) => {
                return !isInCommunity.some(commnunityArt => sav.id_article === commnunityArt.article_id_community);
            });

            const flatArticle = filterArticle.map((art) => {
                const { writer, article_has_categories, sanitizedText, ...articleData } = art;
                const categories = article_has_categories.map(cat => ({
                category: {
                    cat_name: cat.category.cat_name
                }
                }));
                return {
                ...articleData,
                ...writer,
                article_has_categories: categories
                };
            });
            
            const flatSaved = filterSaved.map((art) => {
                const { article,...rest } = art;
                const {article_has_categories,sanitizedText,...restArticle} =article;
                const {writer,...articleData} = restArticle;
                const categories = article_has_categories.map(cat => ({
                category: {
                    cat_name: cat.category.cat_name
                }
                }));
                return {
                ...articleData,
                ...writer,
                article_has_categories: categories
                };
            });

            return [...flatArticle,...flatSaved];
        }catch{
            return [];
        }

    }


    public async postedOnCommunity(userId: number,communityId: number) {
        try {
            const isInCommunity = await this.databaseService.community_has_articles.findMany({
                where: {users_id_community:userId,community_id_community:communityId}
            });
            
            if(!isInCommunity || isInCommunity.length===0){
                throw new DatabaseErrors("no tiene articulos en la comunidad publicados");
            }

            const allArticles:any = [];
            for (const article of isInCommunity){
                const eachArticle = await this.databaseService.article.findUnique({
                    where:{id_article:article.article_id_community},
                    include: { 
                        writer:{select:{
                            username:true,
                            name:true,
                            lastname:true,
                        }},
                        article_has_categories: { select: { category: true } },
                },
                });
                allArticles.push(eachArticle);
            }

            const flatArticle = allArticles.map((art:any) => {
                const { writer, article_has_categories, sanitizedText, ...articleData } = art;
                const categories = article_has_categories.map((cat:any) => ({
                category: {
                    cat_name: cat.category.cat_name
                }
                }));
                return {
                ...articleData,
                ...writer,
                article_has_categories: categories
                };
            });
            return flatArticle;
        }
        catch{
            return;
        }
    }


}

