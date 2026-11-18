

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
    int dis = 0;
    int lca(Node root,int a,int b){
        
        if(root == null) return -1;
        
        if(a == root.data || b == root.data) return 1;
        
        int le = lca(root.left,a,b);
        int ri = lca(root.right,a,b);
        
        if(le != -1 && ri != -1){
            dis = le+ri;
            return le+ri;
        }
        else if(le != -1){
            return le+1;
        }
        else if(ri != -1){
            return ri+1;
        }
        else{
            return -1;
        }
    }
    
    int findDist(Node root, int a, int b) {
        
        lca(root,a,b);
        return dis;
    }
}