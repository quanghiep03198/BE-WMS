import { CreatedUserListener } from './created-user.listener'
import { DeletedUserListener } from './deleted-user.listener'
import { UpdatedUserListener } from './updated-user.listener'

export const UserListeners = [CreatedUserListener, UpdatedUserListener, DeletedUserListener]
