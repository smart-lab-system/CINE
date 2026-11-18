

// User function Template for Java

class Solution {
    // Function to check whether a Binary Tree is BST or not.
    int max(Node root){
        if(root == null) return Integer.MIN_VALUE;
        return Math.max(root.data,Math.max(max(root.left),max(root.right)));
    }
    
    int min(Node root){
        if(root == null) return Integer.MAX_VALUE;
        return Math.min(root.data,Math.min(min(root.left),min(root.right)));
    }
    
    boolean isBST(Node root) {
    if(root == null) return true;
    int maxlst = max(root.left);
    int minrst = min(root.right);
    if(root.data>minrst || root.data<maxlst) return false;
      return isBST( root.left) && isBST(root.right);
      
    }
}