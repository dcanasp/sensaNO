import "reflect-metadata";
import {Request} from 'express'
import {logger, permaLogger} from '../utils/logger'
import {createUserType, chechPasswordType, decryptJWT} from '../dto/user';
import { DatabaseErrors } from '../errors/database.errors';
import {injectable,inject} from 'tsyringe'
import { UserService } from './user.service'

@injectable()
export class UserFacade {
    constructor(@inject(UserService) private userService: UserService) {
    }

    public async getUsersProfile(req : Request) {

        const userId = req.params.id;
        const user = await this.userService.getUsersProfile(userId)
		if (!user){
            return false
		}
		//@ts-ignore
		delete user.hash
        return user
        // return await this.databaseService.getClient().user.findFirst({ where: { id_user: userId2 } });
    }

    public async deleteUsers(req : Request) {

        const userId = req.params.id;
        if(! await this.userService.deleteUsers(parseInt(userId, 10)) ){
			return {"err":'no existe usuario! o no esta permitido eliminarlo'}
		}
        return {"message": "usuario eliminado correctamente!"}
    }

    public async addUsers(body : createUserType) { // const userCreated = await this.databaseService.getClient().user.create({data:{name:body.name,lastname:body.lastname,username:body.username,hash:hash,rol:body.rol} });
        const userCreated = await this.userService.addUsers(body)
		if (!userCreated){
			throw new DatabaseErrors('no se pudo crear el usuario')
		}
        return {userId: userCreated.id_user, rol: userCreated.rol}

    }

    public async checkPassword(body : chechPasswordType) {
        const checkPassword = await this.userService.checkPassword(body);
		if(! checkPassword ){
			return {"err":'usuario no existe'}
		}
		return {"success": checkPassword[0], "token": checkPassword[1]}

    }

    public async decryptJWT(body : decryptJWT) {
        const decripted = await this.userService.decryptJWT(body);
        logger.log('debug',decripted)
		if(! decripted ){
			return {"err":'el token ha fallado,es invalido o ha expirado'}
		}
		return {"userId":decripted["userId"],"rol":decripted["rol"]}

    }

    public async updateProfile(req: Request, body: createUserType) {
        const userId = req.params.id;
        try {
            // Verifica si el usuario existe
            const existingUser = await this.userService.getUsersProfile(userId);
    
            if (!existingUser) {
                return { error: 'El usuario no existe' };
            }
    
            const updatedUser = await this.userService.updateProfile(userId, body);
    
            return updatedUser;
        } catch (error) {
            console.error(error);
            throw new DatabaseErrors('Error al actualizar el perfil del usuario');
        }
    }
    
    
    public async updatePassword(userId: string, currentPassword: string, newPassword: string) {
        try {
            // Verifica la contraseña actual del usuario
            const checkPasswordResult = await this.userService.checkPassword({
                username: userId,
                password: currentPassword,
            });

            if (!checkPasswordResult) {
                return { error: 'Contraseña actual incorrecta' };
            }

            const updatedUser = await this.userService.updatePassword(userId, newPassword);

            return { success: 'Contraseña actualizada correctamente', user: updatedUser };
        } catch (error) {
            console.error(error);
            return { error: 'Error al actualizar la contraseña' };
        }
    }

    // public async addImage(body:any){
    //     const urlS3 =await this.userService.addImage(body);
    //     if(!urlS3){
    //         return{'err':'no se pudo subir a S3'}
    //     }
    //     return {"url":urlS3}
    // }
  
}
