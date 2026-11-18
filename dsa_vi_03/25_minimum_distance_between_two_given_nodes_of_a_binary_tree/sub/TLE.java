

// FUNCTION CODE
/* A Binary Tree node
class Node
{
    int data;
    Node left, right;
   Node(int item)    {
        data = item;
        left = right = null;
    }
} */

/* Should return minimum distance between a and b
   in a tree with given root*/
   class GfG {
    int findDist(Node root, int a, int b) {
        // Your code here
        HashMap<Integer,Node> parentMap = new HashMap<>();
        trav(root,parentMap,null,a);
        Queue<Pair> queue = new LinkedList<>();
        queue.offer(new Pair(0,nod));
        while(!queue.isEmpty()){
            Pair pair = queue.poll();
            Node node = pair.node;
            int step = pair.step;
            if(node.data == b){
                return step;
            }
            if(node.left != null){
                queue.offer(new Pair(step+1,node.left));
            }
            if(node.right != null){
                queue.offer(new Pair(step+1,node.right));
            }
            if(parentMap.get(node.data) != null){
                queue.offer(new Pair(step+1,parentMap.get(node.data)));
            }
        }
        return -1;
        
    }
    private Node nod;
    void trav(Node node, HashMap<Integer,Node> parentMap, Node parent, int val){
        if(node == null){
            return;
        }
        if(node.data == val){
            nod = node;
        }
        parentMap.put(node.data,parent);
        trav(node.left,parentMap,node,val);
        trav(node.right,parentMap,node,val);
    }
}
class Pair{
    int step;
    Node node;
    public Pair(int step, Node node){
        this.step = step;
        this.node = node;
    }
}