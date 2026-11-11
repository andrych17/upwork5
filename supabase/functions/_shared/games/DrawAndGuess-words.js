/* Draw and Guess: the words artists draw. Edit freely (keep the quotes and commas).
 * Each turn the artist is offered 3 words from 3 different categories. Keep words friendly, family-safe, alcohol-free, free of brand names,
 * and drawable. Words don't repeat until they have all been used. */
window.MeetDoDrawWords = {
  categories: [
    { name: "Animals", words: [
      "cat", "dog", "elephant", "giraffe", "penguin", "butterfly", "snail", "octopus",
      "kangaroo", "owl", "turtle", "rabbit", "dolphin", "spider", "frog", "snake",
      "lion", "monkey", "horse", "cow", "pig", "sheep", "duck", "rooster",
      "fish", "shark", "whale", "crab", "bee", "ladybug", "squirrel", "hedgehog",
      "bat", "camel", "zebra", "panda", "flamingo", "peacock", "parrot", "swan",
      "seahorse", "jellyfish", "caterpillar", "dragonfly", "hippo", "crocodile", "polar bear", "reindeer",
      "beaver", "llama"
    ] },
    { name: "Food & Treats", words: [
      "pizza", "hamburger", "ice cream cone", "cupcake", "banana", "watermelon", "pineapple", "spaghetti",
      "sandwich", "popcorn", "pancakes", "pretzel", "donut", "cookie", "apple", "carrot",
      "corn on the cob", "taco", "cheese", "egg", "bread", "birthday cake", "lollipop", "candy cane",
      "pumpkin pie", "hot dog", "french fries", "sushi", "soup", "salad", "strawberry", "cherries",
      "grapes", "lemon", "broccoli", "mushroom", "avocado", "pear", "peach", "coconut",
      "cinnamon roll", "waffle", "gingerbread man", "popsicle", "cheeseburger", "fruit basket", "bowl of cereal", "jar of honey",
      "chocolate bar", "glass of milk"
    ] },
    { name: "Around the House", words: [
      "bed", "chair", "lamp", "clock", "mirror", "toothbrush", "umbrella", "window",
      "door", "key", "scissors", "telephone", "television", "bookshelf", "bathtub", "refrigerator",
      "oven", "broom", "vacuum cleaner", "washing machine", "ladder", "candle", "rug", "curtains",
      "fireplace", "couch", "pillow", "blanket", "teapot", "frying pan", "spoon", "fork",
      "bucket", "flashlight", "doorbell", "ceiling fan", "staircase", "light bulb", "mailbox", "picture frame",
      "alarm clock", "coat hanger", "laundry basket", "toaster", "kettle", "shower", "sink", "hammer",
      "paintbrush", "sewing needle"
    ] },
    { name: "Nature & Weather", words: [
      "sun", "moon", "rainbow", "tree", "flower", "mountain", "waterfall", "volcano",
      "cloud", "snowman", "lightning", "tornado", "island", "beach", "desert", "cave",
      "river", "leaf", "star", "campfire", "forest", "lake", "sunflower", "cactus",
      "palm tree", "pine tree", "seashell", "snowflake", "raindrop", "umbrella in the rain", "iceberg", "meadow",
      "valley", "sunrise", "sunset", "rose", "tulip", "pinecone", "mushroom house", "bird's nest",
      "spider web", "puddle", "garden", "hill", "shooting star", "milky way", "thunderstorm", "foggy morning",
      "icicle", "windy day"
    ] },
    { name: "Sports & Games", words: [
      "soccer ball", "basketball", "tennis racket", "bowling", "baseball bat", "skateboard", "swimming", "golf",
      "surfing", "skiing", "ice skating", "archery", "jump rope", "kite", "yo-yo", "chess",
      "dominoes", "puzzle", "playing cards", "trophy", "whistle", "football", "boxing gloves", "bicycle race",
      "hopscotch", "sack race", "tug of war", "hula hoop", "diving", "rowing", "fishing", "trampoline",
      "roller skates", "snowboard", "cricket", "badminton", "volleyball", "marathon", "ping pong", "dice",
      "balloon", "swing", "slide", "seesaw", "sandcastle", "treasure hunt", "tic-tac-toe", "checkers",
      "bubble blowing", "pogo stick"
    ] },
    { name: "Travel & Vehicles", words: [
      "airplane", "helicopter", "train", "bus", "bicycle", "sailboat", "submarine", "rocket",
      "hot air balloon", "school bus", "fire truck", "ambulance", "tractor", "motorcycle", "canoe", "cruise ship",
      "taxi", "scooter", "wheelbarrow", "horse and carriage", "tugboat", "ferry", "parachute", "suitcase",
      "passport", "map", "compass", "tent", "backpack", "lighthouse", "airport", "train station",
      "bridge", "road sign", "traffic light", "gas pump", "parking meter", "ice cream truck", "race car", "tricycle",
      "skateboard ramp", "sled", "snowmobile", "cable car", "roller coaster", "ferris wheel", "steam engine", "hang glider",
      "kayak", "camper van"
    ] },
    { name: "Jobs & Helpers", words: [
      "firefighter", "doctor", "teacher", "farmer", "chef", "astronaut", "mail carrier", "pilot",
      "dentist", "police officer", "artist", "musician", "builder", "gardener", "fisherman", "baker",
      "barber", "scientist", "librarian", "clown", "magician", "photographer", "lifeguard", "bus driver",
      "painter", "carpenter", "waiter", "farmer with a tractor", "sailor", "pirate", "cowboy", "knight",
      "king", "queen", "princess", "detective", "mechanic", "plumber", "nurse", "singer",
      "dancer", "juggler", "acrobat", "scarecrow", "snow shoveler", "window washer", "bellhop", "referee",
      "coach", "tour guide"
    ] },
    { name: "Actions", words: [
      "jumping", "sleeping", "running", "dancing", "singing", "reading a book", "brushing teeth", "riding a bike",
      "climbing a tree", "cooking dinner", "sneezing", "laughing", "painting a picture", "flying a kite", "hiking", "playing guitar",
      "walking a dog", "planting seeds", "making a snowman", "blowing out candles", "jumping rope", "waving goodbye", "taking a photo", "building a sandcastle",
      "washing dishes", "mowing the lawn", "raking leaves", "ringing a doorbell", "knocking on a door", "eating spaghetti", "drinking from a straw", "yawning",
      "hugging", "shaking hands", "tying a shoe", "buttoning a coat", "opening an umbrella", "sweeping", "skating", "sledding",
      "roasting marshmallows", "juggling", "whistling", "tiptoeing", "stretching", "clapping", "winking", "carrying a heavy box",
      "scrubbing a floor", "pouring juice"
    ] },
    { name: "Places & Buildings", words: [
      "castle", "school", "library", "hospital", "farm", "barn", "windmill", "igloo",
      "treehouse", "pyramid", "church steeple", "fire station", "bakery", "museum", "zoo", "playground",
      "campsite", "bus stop", "skyscraper", "cabin", "tent city", "circus tent", "movie theater", "swimming pool",
      "beach house", "farmers market", "clock tower", "train tunnel", "fountain", "park bench", "greenhouse", "post office",
      "barn dance", "water tower", "gazebo", "hotel", "restaurant", "bowling alley", "town square", "airport tower",
      "sandbox", "cottage", "doghouse", "birdhouse", "tower of blocks", "parking lot", "carousel", "amusement park",
      "lemonade stand", "ice rink"
    ] },
    { name: "Fun & Fantasy", words: [
      "dragon", "unicorn", "mermaid", "fairy", "robot", "alien", "ghost", "wizard",
      "treasure chest", "magic wand", "crown", "pirate ship", "flying carpet", "giant", "snowman with a hat", "rocket to the moon",
      "genie lamp", "haunted house", "monster", "superhero", "ninja", "yeti", "elf", "castle in the clouds",
      "pot of gold", "pegasus", "dinosaur", "sea monster", "talking tree", "time machine", "treasure map", "magic mirror",
      "fire-breathing dragon", "tiny house on a snail", "sleeping giant", "gingerbread house", "jack in the box", "snow globe", "birthday party", "balloon animal",
      "scarecrow dance", "cloud castle", "paper airplane", "message in a bottle", "rainbow slide", "moon rocket", "dancing robot", "friendly ghost",
      "bubble city", "baby dragon"
    ] }
  ]
};
