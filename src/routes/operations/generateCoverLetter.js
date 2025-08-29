import { createAction } from '../../middleware/operations.js'
import generateCoverLetter from '../../actions/generateCoverLetter.js'

export default createAction(generateCoverLetter)
